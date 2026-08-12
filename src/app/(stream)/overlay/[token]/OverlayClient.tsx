"use client";

/**
 * Client overlay: polls /api/twitch/overlay/[token]/latest, detects new
 * broadcaster shuffles via the createdAt timestamp, and animates a card
 * on for ~8 seconds before fading out.
 *
 * Adaptive polling: 2s when a session is active (responsive overlay),
 * 30s when idle (no active session). Idle backoff cuts ~95% of requests
 * when OBS is open without an active stream session. Client also caches
 * the active session ID and passes it back to the API to skip the
 * session-lookup query on the hot path.
 *
 * If we ever need true real-time, Supabase Realtime broadcast on a
 * per-connection channel is the upgrade path — no schema change required.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import { getImagePath } from "@/lib/images";
import { WheelOverlay, type WheelSpinView } from "@/components/overlay/WheelOverlay";
import { DiceOverlay, type DiceOverlayPayload } from "@/components/overlay/DiceOverlay";
import { CoinOverlay, type CoinOverlayPayload } from "@/components/overlay/CoinOverlay";
import { OracleOverlay, type OracleOverlayPayload } from "@/components/overlay/OracleOverlay";
import { NamePickerOverlay, type NamePickerOverlayPayload } from "@/components/overlay/NamePickerOverlay";
import { TimerOverlay, type TimerOverlayPayload } from "@/components/overlay/TimerOverlay";
import { BingoOverlay, type BingoOverlayPayload } from "@/components/overlay/BingoOverlay";
import { TierListOverlay, type TierListOverlayPayload } from "@/components/overlay/TierListOverlay";
import { TournamentRaceOverlay, type TournamentRaceOverlayPayload } from "@/components/overlay/TournamentRaceOverlay";
import { placementStyle, resolveFormat, isPlacementEnabled, type OverlayFormat, type LayoutProfile } from "@/lib/overlay/format";
import { TokenIcon } from "@/components/TokenIcon";
import "@/styles/overlay.css";

const ACTIVE_POLL_MS = 2000;
const IDLE_POLL_MS = 30000;
const SHOW_DURATION_MS = 8000;
// Wheel: ~5s ease-out spin + ~3.5s result hold before it clears.
const WHEEL_TOTAL_MS = 8500;

interface ComboImage {
  name: string;
  img: string;
}

interface ComboPayload {
  character?: ComboImage;
  vehicle?: ComboImage;
  wheels?: ComboImage;
  glider?: ComboImage;
}

interface ShufflePayload {
  id: string;
  displayName: string;
  combo: ComboPayload | null;
  createdAt: string;
}

interface PicksBansOverlayPayload {
  roundId: string;
  gameSlug: string;
  streamerSlug: string;
  locked: number;
  inProgress: number;
  topPicks: Array<{ id: string; count: number; pool: string }>;
  topBans: Array<{ id: string; count: number; pool: string }>;
}

interface WheelSpinPayload extends WheelSpinView {
  createdAt: string;
}

interface EventsOverlayPayload {
  modifiers: Array<{ id: string; effect: string; scope: string; expiresAt: string }>;
  challenges: Array<{
    id: string;
    variableType: string;
    condition: Record<string, unknown> | null;
    reward: number | null;
    penalty: number | null;
    targetName: string | null;
  }>;
}

interface OverlayEventPayload {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  ttlMs: number | null;
  createdAt: string;
}

interface ApiResponse {
  ok: true;
  broadcaster: string | null;
  session: { id: string; randomizerSlug: string | null } | null;
  shuffle: ShufflePayload | null;
  picksBans: PicksBansOverlayPayload | null;
  wheelSpin: WheelSpinPayload | null;
  events: EventsOverlayPayload | null;
  overlayEvents?: OverlayEventPayload[];
  layouts?: Partial<Record<OverlayFormat, LayoutProfile>>;
}

/** Render a generic tool overlay event by type. Add a case per tool. */
function renderToolEvent(
  ev: OverlayEventPayload,
  format: OverlayFormat,
  layout?: LayoutProfile | null,
) {
  // Streamer can hide a tool for a given format in the layout editor.
  if (!isPlacementEnabled(format, ev.type, layout)) return null;
  switch (ev.type) {
    case "dice":
      return (
        <DiceOverlay
          key={ev.id}
          payload={ev.payload as unknown as DiceOverlayPayload}
          style={placementStyle(format, "dice", layout)}
        />
      );
    case "coin":
      return (
        <CoinOverlay
          key={ev.id}
          payload={ev.payload as unknown as CoinOverlayPayload}
          style={placementStyle(format, "coin", layout)}
        />
      );
    case "oracle":
      return (
        <OracleOverlay
          key={ev.id}
          payload={ev.payload as unknown as OracleOverlayPayload}
          style={placementStyle(format, "oracle", layout)}
        />
      );
    case "name_picker":
      return (
        <NamePickerOverlay
          key={ev.id}
          payload={ev.payload as unknown as NamePickerOverlayPayload}
          style={placementStyle(format, "name_picker", layout)}
        />
      );
    case "timer":
      return (
        <TimerOverlay
          key={ev.id}
          payload={ev.payload as unknown as TimerOverlayPayload}
          style={placementStyle(format, "timer", layout)}
        />
      );
    case "bingo":
      return (
        <BingoOverlay
          key={ev.id}
          payload={ev.payload as unknown as BingoOverlayPayload}
          style={placementStyle(format, "bingo", layout)}
        />
      );
    case "tierlist":
      return (
        <TierListOverlay
          key={ev.id}
          payload={ev.payload as unknown as TierListOverlayPayload}
          style={placementStyle(format, "tierlist", layout)}
        />
      );
    case "tournament_race":
      return (
        <TournamentRaceOverlay
          key={ev.id}
          payload={ev.payload as unknown as TournamentRaceOverlayPayload}
          style={placementStyle(format, "tournament_race", layout)}
        />
      );
    default:
      return null;
  }
}

function tidyLabel(s: string): string {
  const t = (s ?? "").replace(/[_-]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function describeChallenge(c: EventsOverlayPayload["challenges"][number]): string {
  const cond = c.condition
    ? Object.values(c.condition)
        .map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v)))
        .filter(Boolean)
        .join(", ")
    : "";
  return cond ? `${tidyLabel(c.variableType)}: ${cond}` : tidyLabel(c.variableType);
}

export function OverlayClient({
  token,
  brandStyle,
}: {
  token: string;
  brandStyle?: CSSProperties;
}) {
  const [active, setActive] = useState<ShufflePayload | null>(null);
  const [phase, setPhase] = useState<"hidden" | "entering" | "holding" | "leaving">("hidden");
  const [picksBans, setPicksBans] = useState<PicksBansOverlayPayload | null>(null);
  const [events, setEvents] = useState<EventsOverlayPayload | null>(null);
  const [activeWheel, setActiveWheel] = useState<WheelSpinPayload | null>(null);
  const [toolEvents, setToolEvents] = useState<OverlayEventPayload[]>([]);
  const [format, setFormat] = useState<OverlayFormat>("landscape");
  const [layouts, setLayouts] = useState<Partial<Record<OverlayFormat, LayoutProfile>>>({});
  const lastSeenRef = useRef<string | null>(null);
  const lastSeenWheelRef = useRef<string | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const wheelHideTimerRef = useRef<number | null>(null);
  const seenToolRef = useRef<Set<string>>(new Set());
  const toolTimersRef = useRef<Map<string, number>>(new Map());

  // overlay.css's global reset (transparent bg + `overflow: hidden`) is scoped to
  // this class so it applies ONLY on the real OBS overlay route — the account
  // Overlay Layout editor imports the same stylesheet and must not lock app scroll.
  useEffect(() => {
    document.documentElement.classList.add("gs-overlay-route");
    return () => document.documentElement.classList.remove("gs-overlay-route");
  }, []);

  // Detect the overlay format from the browser-source dimensions (a `?format=`
  // override wins). Re-detect on resize so OBS canvas changes are honored.
  useEffect(() => {
    const update = () =>
      setFormat(resolveFormat(window.location.search, window.innerWidth, window.innerHeight));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Fold new tool overlay events into the active set. One-shots (ttlMs)
  // auto-remove; persistent events replace any prior event of the same type.
  // On prime (first poll after load) we skip one-shot *history* — a stale dice
  // pop shouldn't replay — but DO restore persistent events (e.g. a running
  // timer), so an OBS overlay reload mid-countdown picks the clock back up. The
  // renderer self-hides anything already expired.
  const processToolEvents = useCallback(
    (events: OverlayEventPayload[] | undefined, prime: boolean) => {
      if (!events?.length) return;
      // Oldest first so the newest ends up last (on top).
      for (const ev of [...events].reverse()) {
        if (seenToolRef.current.has(ev.id)) continue;
        seenToolRef.current.add(ev.id);
        const oneShot = !!(ev.ttlMs && ev.ttlMs > 0);
        if (prime && oneShot) continue;
        if (oneShot) {
          setToolEvents((prev) => [...prev, ev]);
          const t = window.setTimeout(() => {
            setToolEvents((prev) => prev.filter((e) => e.id !== ev.id));
            toolTimersRef.current.delete(ev.id);
          }, ev.ttlMs as number);
          toolTimersRef.current.set(ev.id, t);
        } else {
          setToolEvents((prev) => [...prev.filter((e) => e.type !== ev.type), ev]);
        }
      }
    },
    [],
  );

  const showWheel = useCallback((spin: WheelSpinPayload) => {
    if (wheelHideTimerRef.current) window.clearTimeout(wheelHideTimerRef.current);
    setActiveWheel(spin);
    wheelHideTimerRef.current = window.setTimeout(
      () => setActiveWheel(null),
      WHEEL_TOTAL_MS,
    );
  }, []);

  // Fired when the wheel finishes landing in-stream — posts the winner to
  // chat (server-side idempotent, so a re-fire is harmless).
  const announceSpin = useCallback(
    (spinId: string) => {
      void fetch(`/api/twitch/overlay/${encodeURIComponent(token)}/announce-spin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spinId }),
      }).catch(() => {});
    },
    [token],
  );

  const showShuffle = useCallback((shuffle: ShufflePayload) => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);

    setActive(shuffle);
    // Force a fresh enter even if we were already showing — short hidden tick
    setPhase("hidden");
    window.setTimeout(() => setPhase("entering"), 20);
    window.setTimeout(() => setPhase("holding"), 500);
    fadeTimerRef.current = window.setTimeout(
      () => setPhase("leaving"),
      SHOW_DURATION_MS - 500
    );
    hideTimerRef.current = window.setTimeout(() => {
      setPhase("hidden");
      setActive(null);
    }, SHOW_DURATION_MS);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const toolTimers = toolTimersRef.current;
    const currentSessionIdRef: { current: string | null } = { current: null };
    const currentIntervalRef: { current: number } = { current: ACTIVE_POLL_MS };
    const pollTimeoutRef: { current: number | null } = { current: null };

    const buildUrl = () => {
      const url = new URL(
        `/api/twitch/overlay/${encodeURIComponent(token)}/latest`,
        window.location.origin
      );
      if (lastSeenRef.current) url.searchParams.set("since", lastSeenRef.current);
      if (currentSessionIdRef.current) {
        url.searchParams.set("session", currentSessionIdRef.current);
      }
      return url;
    };

    const fetchOnce = async (): Promise<ApiResponse | null> => {
      try {
        const res = await fetch(buildUrl().toString(), { cache: "no-store" });
        if (!res.ok) return null;
        return (await res.json()) as ApiResponse;
      } catch {
        return null;
      }
    };

    const tick = async () => {
      if (cancelled) return;
      const data = await fetchOnce();
      if (cancelled) return;

      if (data) {
        currentSessionIdRef.current = data.session?.id ?? null;
        if (data.shuffle && data.shuffle.createdAt !== lastSeenRef.current) {
          lastSeenRef.current = data.shuffle.createdAt;
          showShuffle(data.shuffle);
        }
        if (
          data.wheelSpin &&
          data.wheelSpin.createdAt !== lastSeenWheelRef.current
        ) {
          lastSeenWheelRef.current = data.wheelSpin.createdAt;
          showWheel(data.wheelSpin);
        }
        setPicksBans(data.picksBans ?? null);
        setEvents(data.events ?? null);
        if (data.layouts) setLayouts(data.layouts);
        processToolEvents(data.overlayEvents, false);
      }

      // Choose next interval based on session presence. Network blip
      // (data === null) keeps the previous cadence so a transient
      // failure during an active session doesn't stretch us out to 30s.
      const nextInterval = data
        ? data.session
          ? ACTIVE_POLL_MS
          : IDLE_POLL_MS
        : currentIntervalRef.current;
      currentIntervalRef.current = nextInterval;

      if (cancelled) return;
      pollTimeoutRef.current = window.setTimeout(tick, nextInterval);
    };

    // Prime: same logic as a regular tick — sets last-seen marker so the
    // most recent historical shuffle isn't animated on first load, and
    // primes the session id + cadence before the first scheduled tick.
    const prime = async () => {
      const data = await fetchOnce();
      if (cancelled || !data) {
        // No data on prime — schedule the first real tick at the
        // default active cadence so we recover fast if the network was
        // just blipping.
        if (!cancelled) {
          pollTimeoutRef.current = window.setTimeout(tick, ACTIVE_POLL_MS);
        }
        return;
      }
      currentSessionIdRef.current = data.session?.id ?? null;
      if (data.shuffle) lastSeenRef.current = data.shuffle.createdAt;
      if (data.wheelSpin) lastSeenWheelRef.current = data.wheelSpin.createdAt;
      setPicksBans(data.picksBans ?? null);
      setEvents(data.events ?? null);
      if (data.layouts) setLayouts(data.layouts);
      processToolEvents(data.overlayEvents, true);
      const initialInterval = data.session ? ACTIVE_POLL_MS : IDLE_POLL_MS;
      currentIntervalRef.current = initialInterval;
      if (!cancelled) {
        pollTimeoutRef.current = window.setTimeout(tick, initialInterval);
      }
    };

    void prime();

    return () => {
      cancelled = true;
      if (pollTimeoutRef.current) window.clearTimeout(pollTimeoutRef.current);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
      if (wheelHideTimerRef.current) window.clearTimeout(wheelHideTimerRef.current);
      toolTimers.forEach((t) => window.clearTimeout(t));
      toolTimers.clear();
    };
  }, [token, showShuffle, showWheel, processToolEvents]);

  // The overlay can render two independent elements at once:
  //   - the shuffle card animation (existing)
  //   - the picks/bans status banner (new)
  // Either or both may be visible. Empty fragment when neither is active.
  if (!active && !picksBans && !activeWheel && !events && toolEvents.length === 0) return null;

  const slots: ComboImage[] = active
    ? [
        active.combo?.character,
        active.combo?.vehicle,
        active.combo?.wheels,
        active.combo?.glider,
      ].filter((s): s is ComboImage => !!s && !!s.img && s.name !== "N/A")
    : [];

  // The combo card is positionable per game via the Overlay Layout editor
  // (randomizer_mk8dx / randomizer_mkw). MK8DX draws 4 parts, MK World 2, so
  // the valid-slot count tells the games apart. Defaults to center (identical
  // to the pre-layout centered card) via GENERIC_PLACEMENT when untouched.
  const comboId = slots.length > 2 ? "randomizer_mk8dx" : "randomizer_mkw";

  return (
    // `display: contents` adds no box (OBS positioning unaffected) but the
    // streamer's --brand-* vars still inherit down to the overlay pieces.
    <div style={{ display: "contents", ...brandStyle }}>
      {activeWheel && (
        <WheelOverlay key={activeWheel.id} spin={activeWheel} onSpinComplete={announceSpin} />
      )}

      {toolEvents.map((ev) => renderToolEvent(ev, format, layouts[format]))}

      {picksBans && (
        <div className="gs-overlay-picks-bans">
          <div className="gs-overlay-picks-bans__headline">
            <span className="gs-overlay-picks-bans__icon">🗳️</span>
            <span>Picks &amp; bans open</span>
          </div>
          <div className="gs-overlay-picks-bans__url">
            gameshuffle.co/live/{picksBans.streamerSlug}
          </div>
          <div className="gs-overlay-picks-bans__counts">
            <strong>{picksBans.locked}</strong> locked
            {picksBans.inProgress > 0 && (
              <> · {picksBans.inProgress} in progress</>
            )}
          </div>
        </div>
      )}

      {events && (events.modifiers.length > 0 || events.challenges.length > 0) && (
        <div className="gs-overlay-events">
          {events.modifiers.length > 0 && (
            <div className="gs-overlay-events__group">
              <div className="gs-overlay-events__heading">
                <span className="gs-overlay-events__icon">⚡</span> Active modifiers
              </div>
              {events.modifiers.map((m) => (
                <div key={m.id} className="gs-overlay-events__row">
                  <span className="gs-overlay-events__label">{tidyLabel(m.effect)}</span>
                  <span className="gs-overlay-events__meta">{tidyLabel(m.scope)}</span>
                </div>
              ))}
            </div>
          )}
          {events.challenges.length > 0 && (
            <div className="gs-overlay-events__group">
              <div className="gs-overlay-events__heading">
                <span className="gs-overlay-events__icon">🎯</span> Open challenges
              </div>
              {events.challenges.map((c) => (
                <div key={c.id} className="gs-overlay-events__row">
                  <span className="gs-overlay-events__label">{describeChallenge(c)}</span>
                  {c.reward !== null && (
                    <span className="gs-overlay-events__reward">+{c.reward.toLocaleString()}<TokenIcon size={14} /></span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {active && isPlacementEnabled(format, comboId, layouts[format]) && (
        <div
          className={`gs-overlay gs-overlay--${phase}`}
          // Position via the layout system. `.gs-overlay` uses `inset:0` for the
          // default center; override right/bottom so the placed box shrinks to
          // the card. The card's entrance animation lives on `.gs-overlay__card`,
          // so it's untouched.
          style={{ ...placementStyle(format, comboId, layouts[format]), right: "auto", bottom: "auto" }}
        >
          <div className="gs-overlay__card">
            <div className="gs-overlay__header">
              <span className="gs-overlay__dice">🎲</span>
              <span className="gs-overlay__name">{active.displayName}</span>
              <span className="gs-overlay__verb">drew</span>
            </div>
            <div className="gs-overlay__slots">
              {slots.map((slot, i) => (
                <div key={i} className="gs-overlay__slot">
                  <div className="gs-overlay__slot-img">
                    <Image
                      src={getImagePath(slot.img)}
                      alt={slot.name}
                      width={120}
                      height={120}
                      unoptimized
                    />
                  </div>
                  <div className="gs-overlay__slot-name">{slot.name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
