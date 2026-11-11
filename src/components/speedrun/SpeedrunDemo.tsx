"use client";

/**
 * "Watch a run" on /speedrun (launch picks 2026-11-10): the real overlay playing a made-up run, sped up, with the
 * moments a run gets (gold splits, the new PB). Pick the game (any game: Super Mario Odyssey first), Column or Strip,
 * and a look, including one with GS Pro or Supporter looks. Plays only while on screen; with reduced motion it holds
 * one moment still. Phones get a close-up at a size the overlay's text can be read (the Column's side of the stream,
 * or the Strip scrolling sideways), never the whole stream shrunk.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button, Chip } from "@empac/cascadeds";
import { IconLock, IconRefresh } from "@tabler/icons-react";
import { DEMO_RUNS, demoRunState, type DemoRun } from "@/lib/speedrun/demo";
import { DEFAULT_LOOK, momentFor } from "@/lib/speedrun/rules";
import type { RelayState, SpeedrunLook } from "@/lib/speedrun/types";
import { SpeedrunCanvas, type SpeedrunMoment } from "./SpeedrunCanvas";

/** How long each split stays on screen, how long a moment plays, and the pause before the run starts again. */
const STEP_MS = 2400;
const MOMENT_MS = { gold: 2600, pb: 6500, reset: 2600 } as const;
const END_HOLD_MS = 7500;

const STYLES: { id: string; label: string; paid?: boolean; look: Partial<SpeedrunLook> }[] = [
  { id: "gs", label: "GameShuffle", look: {} },
  { id: "light", label: "Light", look: { surface: "light" } },
  { id: "accent", label: "Your color", look: { colors: "accent", accent: "#ff7a2f", fill: "glow" } },
  { id: "neon", label: "Neon theme", paid: true, look: { colors: "neon", font: "chakra", fill: "dots", border: "two", line: "Road to a new PB" } },
];

const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (cb: () => void) => {
  const m = window.matchMedia(reducedQuery);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

export function SpeedrunDemo() {
  const reduced = useSyncExternalStore(subscribeReduced, () => window.matchMedia(reducedQuery).matches, () => false);
  const [runId, setRunId] = useState(DEMO_RUNS[0].id);
  const [layout, setLayout] = useState<SpeedrunLook["layout"]>("column");
  const [styleId, setStyleId] = useState("gs");
  const [round, setRound] = useState(0);
  const run: DemoRun = DEMO_RUNS.find((r) => r.id === runId) ?? DEMO_RUNS[0];
  const style = STYLES.find((s) => s.id === styleId) ?? STYLES[0];
  const look: SpeedrunLook = useMemo(() => ({ ...DEFAULT_LOOK, layout, ...style.look }), [layout, style]);

  // Where the run is: `done` splits in. A moment plays when a split lands as a gold or the run ends as a PB.
  const [snap, setSnap] = useState<{ state: RelayState; at: number }>(() => ({ state: demoRunState(run, 0), at: 0 }));
  const [moment, setMoment] = useState<SpeedrunMoment | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const seen = useRef(true);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => { seen.current = e.isIntersecting; }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const n = run.names.length;
    if (reduced) {
      // One still moment: a gold split a third of the way in (or the first split).
      const k = Math.max(1, run.run.findIndex((v, i) => v < run.best[i]) + 1);
      setSnap({ state: demoRunState(run, k, 0, k), at: performance.now() });
      setMoment(null);
      return;
    }
    let done = 0;
    let seq = 1;
    let prev: RelayState | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let momentId = 0;
    const show = (state: RelayState) => {
      const kind = momentFor(prev, state);
      prev = state;
      setSnap({ state, at: performance.now() });
      if (kind) {
        const id = ++momentId;
        setMoment({ kind, id });
        setTimeout(() => setMoment((m) => (m && m.id === id ? null : m)), MOMENT_MS[kind]);
      }
    };
    const tick = () => {
      if (!seen.current) { timer = setTimeout(tick, 600); return; }
      if (done > n) { done = 0; prev = null; }
      // A split starts the clock, then each one lands a step later; the last stays up a while.
      show(demoRunState(run, done, done === 0 ? 0.2 : 0, seq++));
      const wait = done >= n ? END_HOLD_MS : prev?.last?.gold ? STEP_MS + 900 : STEP_MS;
      done += 1;
      timer = setTimeout(tick, wait);
    };
    setMoment(null);
    tick();
    return () => clearTimeout(timer);
  }, [run, reduced, round]);

  const pressed = (on: boolean) => ({ selected: on, "aria-pressed": on });
  return (
    <div className="sr-demo" ref={box}>
      <div className={`sr-demo__stage is-${layout}`} role="img" aria-label={`The speedrun overlay playing a made-up ${run.label} run (${run.category}), sped up, in the ${layout === "strip" ? "Strip" : "Column"} layout`}>
        <div aria-hidden="true">
          <SpeedrunCanvas state={snap.state} receivedAt={snap.at} look={look} moment={moment} still={reduced} backdrop />
        </div>
      </div>
      <div className="sr-demo__controls">
        <div className="sr-demo__row" role="group" aria-label="Game">
          <span className="sr-demo__k" aria-hidden="true">Game</span>
          {DEMO_RUNS.map((r) => <Chip key={r.id} clickable {...pressed(r.id === runId)} onClick={() => setRunId(r.id)} label={r.label} />)}
        </div>
        <div className="sr-demo__row" role="group" aria-label="Layout">
          <span className="sr-demo__k" aria-hidden="true">Layout</span>
          <Chip clickable {...pressed(layout === "column")} onClick={() => setLayout("column")} label="Column" />
          <Chip clickable {...pressed(layout === "strip")} onClick={() => setLayout("strip")} label="Strip" />
        </div>
        <div className="sr-demo__row" role="group" aria-label="Look">
          <span className="sr-demo__k" aria-hidden="true">Look</span>
          {STYLES.map((s) => <Chip key={s.id} clickable {...pressed(s.id === styleId)} onClick={() => setStyleId(s.id)} label={s.label} icon={s.paid ? <IconLock size={14} aria-hidden /> : undefined} />)}
        </div>
        {!reduced && <Button variant="ghost" size="small" iconBefore={IconRefresh} onClick={() => setRound((n) => n + 1)}>Replay</Button>}
      </div>
      {layout === "strip" && <p className="sr-demo__swipe">Swipe to see the whole strip.</p>}
      <p className="sr-demo__note">{run.label}, {run.category}: a made-up run, sped up.{style.paid ? " The Neon theme, its font, dots, border and the line of your own come with GS Pro or Supporter looks." : ""}</p>
    </div>
  );
}
