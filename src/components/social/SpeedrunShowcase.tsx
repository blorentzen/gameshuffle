"use client";

/**
 * The speedrun overlay on /social/overlays (speedrun launch picks 2026-11-10): the real canvas over its game, playing
 * the visitor page's made-up Super Mario Odyssey run, with chat's "PB this run" bet. Without `play` it holds one
 * frame (three splits in, a gold segment, bets open) for the Twitch chat games guide's picture; with `play` it runs
 * the whole thing on a loop for the launch video: splits every 2.4 seconds, the gold splits and the PB moments, bets
 * locking after Lake and paying out at the finish. A `gs-showcase-restart` event on window starts the run again (the
 * recorder sends it once it's filming). Made-up numbers; nothing is fetched or saved.
 */

import { useEffect, useState } from "react";
import { SpeedrunCanvas, type SpeedrunMoment } from "@/components/speedrun/SpeedrunCanvas";
import { DEMO_RUNS, demoRunState } from "@/lib/speedrun/demo";
import { DEFAULT_LOOK, momentFor } from "@/lib/speedrun/rules";
import type { RelayState, SpeedrunLook, SpeedrunPredictionView } from "@/lib/speedrun/types";

const RUN = DEMO_RUNS[0];
const STEP_MS = 2400;
const END_HOLD_MS = 9000;
const MOMENT_MS = { gold: 2600, pb: 6500, reset: 2600 } as const;
/** Bets lock once this many splits are done (Lake). */
const LOCK_AFTER = 4;
const STILL_DONE = 3;

/** Chat's bet after `done` splits: tokens come in while it's open, it locks after Lake, and the PB pays out. */
function prediction(done: number, finished: boolean): SpeedrunPredictionView {
  const open = done < LOCK_AFTER;
  const step = Math.min(done, LOCK_AFTER);
  const pb = { total: 1200 + step * 850, people: 9 + step * 5 };
  const no = { total: 800 + step * 420, people: 6 + step * 3 };
  const total = pb.total + no.total;
  return {
    marketId: "showcase", attempt: RUN.attempt, status: finished ? "settled" : open ? "open" : "locked",
    lockAfter: LOCK_AFTER, lockName: RUN.names[LOCK_AFTER - 1], pbPct: Math.round((pb.total / total) * 100),
    total, people: pb.people + no.people, pb, no,
    result: finished ? { winner: "pb", winners: pb.people, pot: total, refunded: false } : null,
    endedAt: finished ? Date.now() : null,
  };
}

export function SpeedrunShowcase({ layout, play }: { layout: SpeedrunLook["layout"]; play: boolean }) {
  const look: SpeedrunLook = { ...DEFAULT_LOOK, layout };
  const [snap, setSnap] = useState<{ state: RelayState; at: number; done: number }>(() => ({ state: demoRunState(RUN, STILL_DONE, 60, STILL_DONE), at: 0, done: STILL_DONE }));
  const [moment, setMoment] = useState<SpeedrunMoment | null>(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    const restart = () => setRound((r) => r + 1);
    window.addEventListener("gs-showcase-restart", restart);
    return () => window.removeEventListener("gs-showcase-restart", restart);
  }, []);

  useEffect(() => {
    const n = RUN.names.length;
    if (!play) {
      // One frame: the clock reads a minute into the next split.
      setSnap({ state: demoRunState(RUN, STILL_DONE, 60, STILL_DONE), at: performance.now(), done: STILL_DONE });
      return;
    }
    let done = 0;
    let seq = 1;
    let prev: RelayState | null = null;
    let momentId = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (done > n) { done = 0; prev = null; }
      const state = demoRunState(RUN, done, done === 0 ? 0.2 : 0, seq++);
      const kind = momentFor(prev, state);
      prev = state;
      setSnap({ state, at: performance.now(), done });
      if (kind) {
        const id = ++momentId;
        setMoment({ kind, id });
        setTimeout(() => setMoment((m) => (m && m.id === id ? null : m)), MOMENT_MS[kind]);
      }
      const wait = done >= n ? END_HOLD_MS : state.last?.gold ? STEP_MS + 900 : STEP_MS;
      done += 1;
      timer = setTimeout(tick, wait);
    };
    setMoment(null);
    tick();
    return () => clearTimeout(timer);
  }, [play, round]);

  const finished = snap.done >= RUN.names.length;
  // The bet shows from the first split, like the real one.
  const bet = snap.done >= 1 ? prediction(snap.done, finished) : null;
  return (
    <div className="overlay-showcase__speedrun">
      <SpeedrunCanvas state={snap.state} receivedAt={snap.at} look={look} moment={moment} still={!play} backdrop prediction={bet} />
    </div>
  );
}
