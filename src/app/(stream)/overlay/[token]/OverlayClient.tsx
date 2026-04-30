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

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { getImagePath } from "@/lib/images";
import "@/styles/overlay.css";

const ACTIVE_POLL_MS = 2000;
const IDLE_POLL_MS = 30000;
const SHOW_DURATION_MS = 8000;

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

interface ApiResponse {
  ok: true;
  broadcaster: string | null;
  session: { id: string; randomizerSlug: string | null } | null;
  shuffle: ShufflePayload | null;
}

export function OverlayClient({ token }: { token: string }) {
  const [active, setActive] = useState<ShufflePayload | null>(null);
  const [phase, setPhase] = useState<"hidden" | "entering" | "holding" | "leaving">("hidden");
  const lastSeenRef = useRef<string | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<number | null>(null);

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
    };
  }, [token, showShuffle]);

  if (!active) return null;

  const slots: ComboImage[] = [active.combo?.character, active.combo?.vehicle, active.combo?.wheels, active.combo?.glider]
    .filter((s): s is ComboImage => !!s && !!s.img && s.name !== "N/A");

  return (
    <div className={`gs-overlay gs-overlay--${phase}`}>
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
  );
}
