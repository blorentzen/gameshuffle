"use client";

/**
 * The rolling animation for a text result (a board, map, stage, track, ruleset):
 * when it mounts with `spin` on, it flicks through names from `pool` for about
 * 0.7s and then lands on `value`. Parents re-key it each time that spot rolls,
 * so a locked spot (not re-keyed) never spins. Nothing moves under reduced motion.
 */

import { useEffect, useState } from "react";

export function useRollFrames<T>(pool: readonly T[] | undefined, spin: boolean, steps = 9, ms = 75): T | null {
  const [frame, setFrame] = useState<T | null>(null);
  useEffect(() => {
    if (!spin || !pool?.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timers: number[] = [];
    for (let i = 0; i < steps; i++) timers.push(window.setTimeout(() => setFrame(pool[Math.floor(Math.random() * pool.length)]), i * ms));
    timers.push(window.setTimeout(() => setFrame(null), steps * ms + 40));
    return () => timers.forEach(clearTimeout);
    // Mount only: a roll re-keys the spot, so ordinary re-renders never replay it.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return frame;
}

export function RollingText({ value, pool, spin = true, className }: {
  value: string;
  pool: readonly string[];
  spin?: boolean;
  className?: string;
}) {
  const frame = useRollFrames(pool, spin);
  const state = frame !== null ? " is-rolling" : spin ? " is-landed" : "";
  return <span className={`rolling-text${state}${className ? ` ${className}` : ""}`} aria-hidden={frame !== null || undefined}>{frame ?? value}</span>;
}
