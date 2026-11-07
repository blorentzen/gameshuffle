"use client";

/**
 * A roll that arrives the way the randomizers roll (Britton, 2026-11-07: Roll for me in a game space didn't animate):
 * each part spins through other picks of its kind (the reel the server sends with the roll) on the randomizers' own
 * timing, then lands with a pop, left to right, the main picture first. No reel, or reduced motion: the roll as is.
 * Screen readers hear the result once, when the last part lands.
 */

import { useEffect, useState } from "react";
import { RollCard, type ReelPhase } from "@/components/rolls/RollCard";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { REEL_LAND_MS, reelTimes } from "@/lib/randomizers/reel";
import type { ChatRoll, RollSlot } from "@/lib/twitch/chatRoll";

/** Extra steps per part after the first, so the parts land one after another. */
const STAGGER = 3;

interface Spin { roll: ChatRoll; slots: RollSlot[]; phase: ReelPhase[]; tick: number[] }

export function RollReelCard({ roll, reel }: { roll: ChatRoll; reel?: RollSlot[][] }) {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const spins = !!reel && !reduced;
  const [spin, setSpin] = useState<Spin | null>(null);

  useEffect(() => {
    if (!spins || !reel) return;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    const set = (i: number, slot: RollSlot, phase: ReelPhase) =>
      setSpin((s) => {
        if (!s || s.roll !== roll) return s;
        const next = { ...s, slots: [...s.slots], phase: [...s.phase], tick: [...s.tick] };
        next.slots[i] = slot;
        next.phase[i] = phase;
        next.tick[i] += 1;
        return next;
      });
    at(0, () => setSpin(firstFrame(roll, reel)));
    roll.slots.forEach((target, i) => {
      const pool = reel[i] ?? [];
      if (pool.length < 2) return at(0, () => set(i, target, "idle"));
      const { frames, land } = reelTimes(16 + i * STAGGER);
      frames.forEach((ms, k) => at(ms, () => set(i, pool[(k + 1 + i) % pool.length], "spinning")));
      at(land, () => set(i, target, "landed"));
      at(land + REEL_LAND_MS, () => setSpin((s) => (s && s.roll === roll ? { ...s, phase: s.phase.map((p, j) => (j === i ? "idle" : p)) } : s)));
    });
    return () => timers.forEach(clearTimeout);
  }, [roll, reel, spins]);

  // Until the first timer runs, draw the first frame already, so the result never flashes before the reel starts.
  const view = !spins || !reel ? null : spin && spin.roll === roll ? spin : firstFrame(roll, reel);
  const done = !view || view.phase.every((p) => p !== "spinning");
  return (
    <>
      <RollCard roll={view ? { ...roll, slots: view.slots } : roll} reel={view ? { phase: view.phase, tick: view.tick } : undefined} />
      <p className="sr-only" aria-live="polite">{done ? `Rolled ${roll.slots.map((x) => x.name).join(", ")}.` : ""}</p>
    </>
  );
}

function firstFrame(roll: ChatRoll, reel: RollSlot[][]): Spin {
  return {
    roll,
    slots: roll.slots.map((x, i) => ((reel[i]?.length ?? 0) >= 2 ? reel[i][i % reel[i].length] : x)),
    phase: roll.slots.map((_, i) => ((reel[i]?.length ?? 0) >= 2 ? "spinning" : "idle")),
    tick: roll.slots.map(() => 0),
  };
}
