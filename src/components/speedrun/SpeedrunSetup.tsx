"use client";

/**
 * The speedrun setup (approved mockup screen 4, step 1 of phase 1): the OBS link beside a preview, then one card with
 * the timer (three steps, the masked address with Copy, live status from the relay, "Make a new address"), the game and
 * category, and the look (Column or Strip, where the Strip sits, what the Column shows). Everything autosaves.
 * Used on /speedrun (signed in) and Studio ▸ Tools ▸ Speedrun (`studio`).
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button, Card, Input, Switch } from "@empac/cascadeds";
import { IconCheck, IconCircleCheckFilled, IconCopy, IconRefresh, IconStopwatch } from "@tabler/icons-react";
import { LabeledCombobox } from "@/components/ui/LabeledCombobox";
import { IconTile } from "@/components/ui/IconTile";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { EVENTS, track } from "@/lib/analytics/events";
import { GAME_CATALOG } from "@/data/game-catalog";
import { demoState } from "@/lib/speedrun/demo";
import { CATEGORY_MAX } from "@/lib/speedrun/rules";
import type { SpeedrunLook, SpeedrunSetupView, SpeedrunStats, SpeedrunStatus } from "@/lib/speedrun/types";
import { SpeedrunCanvas } from "./SpeedrunCanvas";

export type SetupBlocked = "not_ready" | "not_configured" | null;

interface Props {
  initial: SpeedrunSetupView | null;
  blocked: SetupBlocked;
  /** Inside the Studio: the tool's name and line head the page. */
  studio?: boolean;
}

interface Form {
  look: SpeedrunLook;
  game: string;
  category: string;
  attempts: string;
}

const STAT_ROWS: { id: keyof SpeedrunStats; label: string; note?: string }[] = [
  { id: "pb", label: "Personal best" },
  { id: "sob", label: "Sum of best", note: "Your best time for every split added up" },
  { id: "attempts", label: "Attempt count" },
  { id: "prevSegment", label: "Previous segment", note: "Time gained or lost on the last split" },
  { id: "pace", label: "Pace", note: "Where the run finishes if the rest matches your PB" },
];

// Mario Kart first (runners first, picks 2026-11-09), then every other game we know; any other name works too.
const GAME_OPTIONS = [...GAME_CATALOG.filter((g) => g.family === "Mario Kart"), ...GAME_CATALOG.filter((g) => g.family !== "Mario Kart")]
  .map((g) => ({ value: g.name, label: g.name }));

const POLL_MS = 5000;
const noopSubscribe = () => () => {};

const formOf = (v: SpeedrunSetupView): Form => ({ look: v.look, game: v.game, category: v.category, attempts: String(v.attempts) });

function maskAddress(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/lso/••••••••`;
  } catch {
    return "••••••••";
  }
}

const ago = (ms: number) => {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} second${s === 1 ? "" : "s"} ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  return `${h} hour${h === 1 ? "" : "s"} ago`;
};

const LAST_WORDS: Record<string, string> = {
  start: "Last run started", split: "Last split", skip: "Last skip", undo: "Last undo", reset: "Last reset",
  finish: "Last finish", pause: "Paused", resume: "Resumed",
};

export function SpeedrunSetup({ initial, blocked, studio = false }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const [view, setView] = useState<SpeedrunSetupView | null>(initial);
  const [form, setForm] = useState<Form | null>(initial ? formOf(initial) : null);
  const [status, setStatus] = useState<SpeedrunStatus | null>(null);
  const [copied, setCopied] = useState(false);
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
  const saved = useRef<Form | null>(initial ? formOf(initial) : null);

  // Only what changed goes out: attempts in particular must not be sent again with a look change (it resets the count).
  const save = useCallback(async (next: Form | null) => {
    if (!next) return true;
    const before = saved.current;
    const patch: Record<string, unknown> = {};
    if (!before || JSON.stringify(before.look) !== JSON.stringify(next.look)) patch.look = next.look;
    if (!before || before.game !== next.game) patch.game = next.game;
    if (!before || before.category !== next.category) patch.category = next.category;
    if (!before || before.attempts !== next.attempts) {
      const n = Number(next.attempts);
      if (next.attempts.trim() !== "" && Number.isInteger(n) && n >= 0) patch.attempts = n;
    }
    if (!Object.keys(patch).length) { saved.current = next; return true; }
    const res = await fetch("/api/speedrun/setup", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    if (!res.ok) return false;
    const body = (await res.json()) as { setup: SpeedrunSetupView; synced: boolean };
    saved.current = next;
    setView(body.setup);
    if (patch.look) track(EVENTS.speedrunLookSaved, { layout: next.look.layout });
    return true;
  }, []);
  useAutosave(form, save, { ready: !!form });

  // Is LiveSplit One connected? Asked every few seconds while the page is showing.
  const hasView = !!view;
  useEffect(() => {
    if (!hasView) return;
    let alive = true;
    const ask = async () => {
      if (document.visibilityState !== "visible") return;
      const res = await fetch("/api/speedrun/status", { cache: "no-store" }).catch(() => null);
      if (!alive || !res) return;
      if (res.ok) setStatus((await res.json()) as SpeedrunStatus);
      else if (res.status === 503) setStatus({ reachable: false, connected: false, phase: "idle", started: false, last: null, lastAgoMs: null, splits: 0 });
    };
    void ask();
    const t = setInterval(() => void ask(), POLL_MS);
    const vis = () => { if (document.visibilityState === "visible") void ask(); };
    document.addEventListener("visibilitychange", vis);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [hasView]);

  const preview = useMemo(() => demoState("mid", form?.game || "mario-kart-8-deluxe", form?.category || "48 Tracks · 150cc, items"), [form?.game, form?.category]);

  if (blocked || !view || !form) {
    return (
      <div className="sr-card sr-gate" role="status">
        <h2 className="sr-gate__h">Speedrun setup</h2>
        <p className="sr-sub">
          {blocked === "not_configured"
            ? "The timer server isn't connected on this copy of GameShuffle yet. Try again soon."
            : "Speedrunning needs its database update before it can be set up here. Try again soon."}
        </p>
      </div>
    );
  }

  const setLook = (patch: Partial<SpeedrunLook>) => setForm((f) => (f ? { ...f, look: { ...f.look, ...patch } } : f));
  const setStat = (id: keyof SpeedrunStats, on: boolean) => setForm((f) => (f ? { ...f, look: { ...f.look, stats: { ...f.look.stats, [id]: on } } } : f));

  async function copy(text: string, ok: string) {
    try { await navigator.clipboard.writeText(text); toast.success(ok); return true; }
    catch { toast.error("Couldn't copy. Select the address and copy it yourself."); return false; }
  }
  async function copyTimer() {
    if (!view) return;
    if (await copy(view.timerAddress, "Address copied. Paste it into LiveSplit One.")) { setCopied(true); track(EVENTS.speedrunAddressCopied, { kind: "timer" }); }
  }
  async function copyObs() {
    if (!view) return;
    if (await copy(`${origin}${view.overlayPath}`, "OBS link copied. Paste it into a Browser source.")) track(EVENTS.speedrunAddressCopied, { kind: "overlay" });
  }
  async function renew(kind: "timer" | "overlay") {
    const ok = await confirm(kind === "timer"
      ? { title: "Make a new address?", body: "Your old address stops working. Paste the new one into LiveSplit One.", confirmLabel: "Make a new address" }
      : { title: "Make a new OBS link?", body: "Your old link stops showing your run. Paste the new one into OBS.", confirmLabel: "Make a new link" });
    if (!ok) return;
    const res = await fetch("/api/speedrun/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: kind === "timer" ? "new-timer" : "new-overlay" }) });
    if (!res.ok) { toast.error("Couldn't make a new one. Try again."); return; }
    const body = (await res.json()) as { setup: SpeedrunSetupView; synced: boolean };
    setView(body.setup);
    if (kind === "timer") setCopied(false);
    toast.success(kind === "timer" ? "New address made. Copy it into LiveSplit One." : "New OBS link made. Copy it into OBS.");
  }

  const connected = !!status?.connected;
  const started = !!status?.started;
  const statusPill = !status
    ? <span className="sr-status sr-status--wait"><i />Checking</span>
    : !status.reachable
      ? <span className="sr-status sr-status--off"><i />Timer server offline</span>
      : connected
        ? <span className="sr-status sr-status--ok"><i />Connected</span>
        : <span className="sr-status sr-status--wait"><i />Waiting</span>;
  const statusLine = !status
    ? "Looking for LiveSplit One."
    : !status.reachable
      ? "Our timer server isn't answering right now. Your setup is saved."
      : connected
        ? status.last && status.lastAgoMs != null
          ? `LiveSplit One is sending your splits. ${LAST_WORDS[status.last] ?? "Last change"} ${ago(status.lastAgoMs)}.`
          : "LiveSplit One is connected. Start a run and your overlay follows it."
        : "Nothing from LiveSplit One yet. Follow the steps, then start a run.";
  const step = (n: number, done: boolean) => (
    <span className={`sr-steps__n${done ? " is-done" : ""}`} aria-hidden="true">{done ? <IconCheck size={16} stroke={3} /> : n}</span>
  );
  const host = origin.replace(/^https?:\/\//, "");

  return (
    <div className="sr-setup">
      <section className="sr-top" aria-label="Your overlay">
        <div className="sr-top__words">
          {studio && (
            <div className="sr-top__name">
              <IconTile icon={IconStopwatch} tone="teal" size="lg" />
              <div><p className="sr-top__title">Speedrun</p><p>Your splits on stream, from the timer you already use</p></div>
            </div>
          )}
          <div>
            <span className="sr-field-label" id="sr-obs-label">Your OBS link</span>
            <div className="sr-addr" role="group" aria-labelledby="sr-obs-label">
              <code aria-label="Your OBS link (hidden)">{host ? `${host}/run/••••••` : "/run/••••••"}</code>
              <Button variant="primary" size="small" iconBefore={IconCopy} onClick={() => void copyObs()}>Copy for OBS</Button>
            </div>
          </div>
          <p className="sr-note">In OBS, add a Browser source at 1920 × 1080 and paste the link. The page behind your splits is see-through.</p>
          <Button variant="ghost" size="small" iconBefore={IconRefresh} className="sr-relink" onClick={() => void renew("overlay")}>Make a new OBS link</Button>
        </div>
        <figure className="sr-preview">
          <div role="img" aria-label={`Preview: the ${form.look.layout === "strip" ? "Strip" : "Column"} over the game, with a made-up run`}>
            <div aria-hidden="true">
              <SpeedrunCanvas state={preview} receivedAt={0} look={form.look} still backdrop />
            </div>
          </div>
          <figcaption>Preview with a made-up run. Your overlay follows your settings below.</figcaption>
        </figure>
      </section>

      <div className="sr-card">
        <div className="sr-cols">
          <div>
            <section className="sr-sec" aria-labelledby="sr-timer-h">
              <div className="sr-sec__h"><h2 id="sr-timer-h">Your timer</h2>{statusPill}</div>
              <p className="sr-sub" aria-live="polite">{statusLine}</p>
              <ol className="sr-steps">
                <li>
                  {step(1, copied || connected)}
                  <div>
                    <b>Copy your server address</b>
                    <div className="sr-addr">
                      <code aria-label="Your server address (hidden)">{maskAddress(view.timerAddress)}</code>
                      <Button variant="secondary" size="small" iconBefore={IconCopy} onClick={() => void copyTimer()}>Copy</Button>
                    </div>
                    <p className="sr-sub">Keep it off stream: anyone with it can send splits to your overlay.</p>
                  </div>
                </li>
                <li>
                  {step(2, connected)}
                  <div>
                    <b>In LiveSplit One, open Settings, then Connect to Server, and paste it</b>
                    <p className="sr-sub">It works in the browser at one.livesplit.org, on any computer. LiveSplit One remembers the address but doesn&apos;t connect on its own: press Connect each time you open it.</p>
                  </div>
                </li>
                <li>
                  {step(3, started)}
                  <div>
                    <b>Start a run</b>
                    <p className="sr-sub">Your overlay wakes up with your first split. If LiveSplit One is on a settings screen, it waits until you close it.</p>
                  </div>
                </li>
              </ol>
              <Button variant="ghost" size="small" iconBefore={IconRefresh} className="sr-relink sr-relink--steps" onClick={() => void renew("timer")}>Make a new address</Button>
            </section>

            <section className="sr-sec" aria-labelledby="sr-game-h">
              <div className="sr-sec__h"><h2 id="sr-game-h">Your run</h2></div>
              <div className="sr-fields">
                <div>
                  <span className="sr-field-label" id="sr-game-label">Game</span>
                  <LabeledCombobox label="Game" value={form.game} onChange={(v) => setForm((f) => (f ? { ...f, game: v.slice(0, 80) } : f))}
                    options={GAME_OPTIONS} placeholder="Pick or type a game" allowCreate createLabel="Use" />
                </div>
                <Input id="sr-category" floatingLabel="Category" value={form.category} maxLength={CATEGORY_MAX} autoComplete="off" fullWidth
                  onChange={(e) => setForm((f) => (f ? { ...f, category: e.target.value } : f))} />
                <div>
                  <Input id="sr-attempts" floatingLabel="Attempts" inputMode="numeric" value={form.attempts} maxLength={6} autoComplete="off" fullWidth
                    onChange={(e) => setForm((f) => (f ? { ...f, attempts: e.target.value.replace(/[^0-9]/g, "") } : f))} aria-describedby="sr-attempts-help" />
                  <p className="sr-sub sr-help" id="sr-attempts-help">LiveSplit One doesn&apos;t send its attempt count. Type yours once and we count up from there.</p>
                </div>
              </div>
            </section>
          </div>

          <div>
            <section className="sr-sec" aria-labelledby="sr-look-h">
              <div className="sr-sec__h"><h2 id="sr-look-h">Look</h2></div>
              <div className="sr-picks" role="group" aria-labelledby="sr-look-h">
                <Card variant="outlined" padding="none" interactive selected={form.look.layout === "column"} onClick={() => setLook({ layout: "column" })} className="sr-pick" aria-label="Column: every split down the side">
                  <span className="sr-pick__in">
                    <span className="sr-thumb" aria-hidden="true"><i className="col" /></span>
                    <b>Column{form.look.layout === "column" && <IconCircleCheckFilled size={18} aria-hidden="true" />}</b>
                    <span>Every split down the side</span>
                  </span>
                </Card>
                <Card variant="outlined" padding="none" interactive selected={form.look.layout === "strip"} onClick={() => setLook({ layout: "strip" })} className="sr-pick" aria-label="Strip: one line along the bottom or top">
                  <span className="sr-pick__in">
                    <span className="sr-thumb" aria-hidden="true"><i className="bar" /></span>
                    <b>Strip{form.look.layout === "strip" && <IconCircleCheckFilled size={18} aria-hidden="true" />}</b>
                    <span>One line along the bottom or top</span>
                  </span>
                </Card>
              </div>

              {form.look.layout === "strip" ? (
                <>
                  <p className="sr-list-h" id="sr-where">Where the Strip sits</p>
                  <div className="sr-picks sr-picks--where" role="group" aria-labelledby="sr-where">
                    {(["bottom", "top"] as const).map((p) => (
                      <Button key={p} variant={form.look.position === p ? "primary" : "secondary"} aria-pressed={form.look.position === p} onClick={() => setLook({ position: p })}>
                        {p === "bottom" ? "Along the bottom" : "Along the top"}
                      </Button>
                    ))}
                  </div>
                  <div className="sr-switches">
                    <div className="sr-sw">
                      <Switch size="large" labelPosition="left" label="Attempt count" checked={form.look.stats.attempts} onChange={(e) => setStat("attempts", e.target.checked)} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="sr-list-h" id="sr-oncol">On the Column</p>
                  <div className="sr-switches" role="group" aria-labelledby="sr-oncol">
                    {STAT_ROWS.map((s) => (
                      <div className="sr-sw" key={s.id}>
                        <Switch size="large" labelPosition="left" label={s.label} helperText={s.note} checked={form.look.stats[s.id]} onChange={(e) => setStat(s.id, e.target.checked)} />
                      </div>
                    ))}
                  </div>
                </>
              )}
              <p className="sr-sub sr-fine">Ahead is green with an arrow down, behind is red with an arrow up, and a best ever segment is gold with a star.</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
