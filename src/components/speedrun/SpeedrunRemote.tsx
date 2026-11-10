"use client";

/**
 * The phone remote (approved mockup screen 5). Ready: one big Start; Undo, Skip and Reset wait until the run starts.
 * Running: Split fills half the screen, with the split being run, the time and the delta above it. Reset asks first and
 * says what happens to the attempt and chat's prediction. The run follows the relay's /watch socket (so splits from
 * LiveSplit One's own hotkeys show too); commands go through /api/speedrun/remote and come back with the new state at
 * once. The screen stays on while a run is going.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Modal } from "@empac/cascadeds";
import {
  IconArrowBackUp, IconCaretDownFilled, IconCaretUpFilled, IconPlayerSkipForward, IconRefresh,
} from "@tabler/icons-react";
import { everyVisible } from "@/lib/hooks/everyVisible";
import { clockParts, fmtClock, fmtDelta } from "@/lib/speedrun/time";
import { currentIndex, isNewPb, lastDelta, pbTime } from "@/lib/speedrun/rules";
import type { RelayState, SpeedrunPredictionView } from "@/lib/speedrun/types";
import { useRunMs } from "./useRunClock";
import { useRelayWatch } from "./useRelayWatch";

type Command = "start" | "split" | "undo" | "skip" | "reset" | "resume";

interface Initial { state: RelayState; reachable: boolean; overlays: number | null }

interface Props {
  blocked: "not_ready" | "not_configured" | null;
  /** The relay's /watch socket for this runner (`?as=remote`); null when the remote can't run here. */
  socketUrl: string | null;
  initial: Initial | null;
  game: string;
  category: string;
}

const STATUS_MS = 15_000;

const ERRORS: Record<string, string> = {
  busy: "LiveSplit One is on a settings screen. Close it, then tap again.",
  no_splits: "Add your splits first: type them in your speedrun setup, or connect LiveSplit One.",
  no_run: "No run is going.",
  run_finished: "The run is finished. Tap Next attempt to save it.",
  run_already_in_progress: "A run is already going.",
  timer_paused: "The clock is paused. Tap Resume first.",
  cant_undo_first_split: "Nothing to undo yet.",
  cant_skip_last_split: "The last split can't be skipped. Split to finish, or reset.",
  unreachable: "The timer server isn't answering. Try again in a moment.",
  not_configured: "The timer server isn't set up here yet.",
  slow_down: "That's a lot of taps. Wait a moment.",
};

function Clock({ ms }: { ms: number }) {
  const p = clockParts(ms);
  return <>{p.main}<small>{p.frac}</small></>;
}

export function SpeedrunRemote({ blocked, socketUrl, initial, game, category }: Props) {
  const [snap, setSnap] = useState<{ state: RelayState; at: number } | null>(initial ? { state: initial.state, at: 0 } : null);
  const [reachable, setReachable] = useState(initial?.reachable ?? false);
  const [overlays, setOverlays] = useState<number | null>(initial?.overlays ?? null);
  const [prediction, setPrediction] = useState<SpeedrunPredictionView | null>(null);
  const [busyWith, setBusyWith] = useState<Command | null>(null);
  const [lsoBusy, setLsoBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [said, setSaid] = useState("");

  const take = useCallback((next: RelayState) => {
    setSnap((cur) => (cur && cur.state.seq > next.seq && cur.state.attempt === next.attempt ? cur : { state: next, at: performance.now() }));
  }, []);
  const socketOpen = useRelayWatch(socketUrl, (next) => { take(next); setReachable(true); });

  // Overlays open and chat's prediction: every so often, and after each command.
  const refresh = useCallback(async () => {
    const res = await fetch("/api/speedrun/remote", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const body = (await res.json()) as { reachable: boolean; state: RelayState | null; overlays: number | null; prediction: SpeedrunPredictionView | null };
    setReachable(body.reachable);
    setOverlays(body.overlays);
    setPrediction(body.prediction);
    if (body.state) take(body.state);
  }, [take]);
  useEffect(() => {
    if (!initial) return;
    void refresh();
    return everyVisible(() => void refresh(), STATUS_MS);
  }, [initial, refresh]);

  const st = snap?.state ?? null;
  const running = st?.phase === "running";
  const going = st?.phase === "running" || st?.phase === "paused";
  const ms = useRunMs(!!running, st?.elapsedMs ?? 0, snap?.at ?? 0);

  // The screen stays on while a run is going.
  const lock = useRef<{ release: () => Promise<void> } | null>(null);
  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    if (!going || !nav.wakeLock) return;
    let off = false;
    const grab = async () => {
      if (off || document.visibilityState !== "visible") return;
      try { lock.current = await nav.wakeLock!.request("screen"); } catch { /* not allowed here */ }
    };
    void grab();
    const vis = () => void grab();
    document.addEventListener("visibilitychange", vis);
    return () => {
      off = true;
      document.removeEventListener("visibilitychange", vis);
      void lock.current?.release().catch(() => {});
      lock.current = null;
    };
  }, [going]);

  const send = async (command: Command) => {
    if (busyWith) return;
    setBusyWith(command);
    setProblem(null);
    try {
      const res = await fetch("/api/speedrun/remote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command }) });
      const body = (await res.json().catch(() => ({ ok: false, error: "unreachable" }))) as { ok: boolean; error?: string; state?: RelayState; overlays?: number | null };
      if (!body.ok || !body.state) {
        const err = body.error ?? "unreachable";
        setLsoBusy(err === "busy");
        setProblem(ERRORS[err] ?? "That didn't go through. Try again.");
        if (err === "unreachable") setReachable(false);
        return;
      }
      setLsoBusy(false);
      setReachable(true);
      if (body.overlays != null) setOverlays(body.overlays);
      take(body.state);
      const s = body.state;
      if (command === "split" || command === "start") { try { navigator.vibrate?.(25); } catch { /* no vibration */ } }
      // Said aloud for screen readers.
      const d = lastDelta(s);
      if (command === "split") setSaid(s.phase === "ended" ? `Finished in ${fmtClock(s.splits.at(-1) ?? s.elapsedMs)}.` : `Split. ${d ? `${fmtDelta(d.ms)} ${d.ms <= 0 ? "ahead" : "behind"}.` : ""} Now ${s.segments[s.index ?? 0]?.name ?? ""}.`);
      else if (command === "start") setSaid("Run started.");
      else if (command === "reset") setSaid("Run reset.");
      else if (command === "undo") setSaid("Split undone.");
      else if (command === "skip") setSaid("Split skipped.");
      if (command === "reset" || command === "split" || command === "start") void refresh();
    } catch {
      setProblem(ERRORS.unreachable);
    } finally {
      setBusyWith(null);
    }
  };

  if (blocked || !st) {
    return (
      <main className="rm">
        <div className="rm-top"><Link href="/speedrun" className="rm-mark" aria-label="Speedrun setup on GameShuffle" /></div>
        <div className="rm-run">
          <h1>Phone remote</h1>
          <p className="rm-meta">{blocked === "not_configured" ? "The timer server isn't connected on this copy of GameShuffle yet." : "Speedrunning needs its database update before the remote works here. Try again soon."}</p>
        </div>
      </main>
    );
  }

  const n = st.segments.length;
  const cur = currentIndex(st);
  const at = st.phase === "ended" ? n - 1 : cur ?? 0;
  const seg = st.segments[at];
  const nextSeg = going && at + 1 < n ? st.segments[at + 1] : null;
  const pb = pbTime(st.segments);
  const d = lastDelta(st);
  const ended = st.phase === "ended";
  const newPb = ended && isNewPb(st);
  const eyebrow = [game || st.game || "", category || st.category || ""].filter(Boolean).join(" · ") || "Speedrun";
  const attemptNow = st.phase === "idle" ? st.attempt + 1 : st.attempt;

  const title = !n ? "No splits yet" : ended ? (newPb ? "New personal best" : "Finished") : seg?.name ?? "";
  const meta = !n
    ? "Type your splits in your speedrun setup, or connect LiveSplit One."
    : st.phase === "idle"
      ? `Split 1 of ${n} · attempt ${attemptNow.toLocaleString("en-US")}${pb != null ? ` · PB ${fmtClock(pb)}` : ""}`
      : ended
        ? `Attempt ${attemptNow.toLocaleString("en-US")}${pb != null ? ` · PB ${fmtClock(pb)}` : ""}`
        : `Split ${at + 1} of ${n}${nextSeg ? ` · next: ${nextSeg.name}` : " · the last split"}${st.phase === "paused" ? " · paused" : ""}`;
  const chip = d ? `${fmtDelta(d.ms)} ${d.ms <= 0 ? "ahead" : "behind"} at ${st.segments[d.index]?.name ?? ""}` : null;

  // The big button: Start, Split, Resume, or Next attempt once it's finished.
  let big: { cmd: Command; label: string; sub: string; tone: "go" | "split" | "done" };
  if (st.phase === "idle") big = { cmd: "start", label: "Start", sub: "Tap when the run starts", tone: "go" };
  else if (st.phase === "paused") big = { cmd: "resume", label: "Resume", sub: "The clock is paused", tone: "go" };
  else if (ended) big = { cmd: "reset", label: "Next attempt", sub: "Saves this run and gets the next one ready", tone: "done" };
  else big = { cmd: "split", label: "Split", sub: `${seg?.name ?? ""}${seg?.pbMs != null ? `, PB here ${fmtClock(seg.pbMs)}` : ""}`, tone: "split" };

  const pill = !reachable && !socketOpen
    ? { cls: "off", text: "Timer server offline" }
    : lsoBusy
      ? { cls: "wait", text: "LiveSplit One is on a settings screen" }
      : overlays === 0
        ? { cls: "wait", text: "Your overlay isn't open" }
        : { cls: "ok", text: "Connected to your overlay" };

  // What a reset does, in words.
  const where = d ? `You're ${fmtDelta(d.ms)} ${d.ms <= 0 ? "ahead" : "behind"} at ${st.segments[d.index]?.name ?? ""}.` : seg ? `You're on ${seg.name}.` : "";
  const chat = prediction && prediction.attempt === st.attempt
    ? prediction.status === "open" ? " Chat gets their tokens back." : prediction.status === "locked" ? " Chat's prediction settles as no PB." : ""
    : "";
  const resetBody = `${where} The run is saved as attempt ${st.attempt.toLocaleString("en-US")}.${chat}`;

  const tap = (cmd: Command) => () => {
    if (cmd === "reset" && going) { setConfirmReset(true); return; }
    void send(cmd);
  };

  return (
    <main className={`rm${confirmReset ? " rm--dim" : ""}`}>
      <div className="rm-top">
        <Link href="/speedrun" className="rm-mark" aria-label="Speedrun setup on GameShuffle" />
        <span className={`rm-pill rm-pill--${pill.cls}`}><i aria-hidden="true" />{pill.text}</span>
      </div>

      <div className="rm-run">
        <span className="rm-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p className="rm-meta">{meta}</p>
        <div className={`rm-clock${newPb ? " is-pb" : ""}`} aria-hidden="true"><Clock ms={st.phase === "idle" ? 0 : ms} /></div>
        {chip && (
          <span className={`rm-chip ${d!.ms <= 0 ? "is-ahead" : "is-behind"}`}>
            {d!.ms <= 0 ? <IconCaretDownFilled size={18} aria-hidden="true" /> : <IconCaretUpFilled size={18} aria-hidden="true" />}{chip}
          </span>
        )}
      </div>

      <Button variant="primary" className={`rm-big rm-big--${big.tone}`} onClick={tap(big.cmd)} disabled={!n || busyWith != null} aria-describedby="rm-big-sub">
        <b>{big.label}</b>
        <span id="rm-big-sub">{big.sub}</span>
      </Button>

      <div className="rm-row">
        <Button variant="secondary" className="rm-small" iconBefore={IconArrowBackUp} onClick={tap("undo")} disabled={!going && !ended || busyWith != null}>Undo</Button>
        <Button variant="secondary" className="rm-small" iconBefore={IconPlayerSkipForward} onClick={tap("skip")} disabled={!going || at >= n - 1 || busyWith != null}>Skip</Button>
        <Button variant="secondary" className="rm-small rm-small--reset" iconBefore={IconRefresh} onClick={tap("reset")} disabled={st.phase === "idle" || busyWith != null}>Reset</Button>
      </div>

      {problem ? <p className="rm-problem" role="alert">{problem}</p> : (
        <p className="rm-note">{st.connected ? "LiveSplit One is connected: these buttons split it." : "Your screen stays on while a run is going."}</p>
      )}
      <p className="sr-only" aria-live="polite">{said}</p>

      <Modal
        isOpen={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset this run?"
        size="small"
        className="rm-sheet"
        destructive
        primaryAction={{ label: "Reset the run", onClick: () => { setConfirmReset(false); void send("reset"); } }}
        secondaryAction={{ label: "Keep running", onClick: () => setConfirmReset(false) }}
      >
        <p className="rm-sheet__text">{resetBody}</p>
      </Modal>
    </main>
  );
}
