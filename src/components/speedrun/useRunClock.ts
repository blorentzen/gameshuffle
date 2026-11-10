"use client";

/**
 * The run's time, ticking. The relay sends the time when it made the state (`elapsedMs`); while the run is running
 * the overlay adds how long ago it got that state, on its own clock (`performance.now()`), never the relay's `at`.
 * Updates only when the tenth on screen changes. Paused, ended or not started: the time as sent.
 */

import { useEffect, useState } from "react";

export function useRunMs(running: boolean, elapsedMs: number, receivedAt: number, still = false): number {
  const [tick, setTick] = useState<{ key: number; ms: number } | null>(null);
  const key = receivedAt + elapsedMs;
  useEffect(() => {
    if (!running || still) return;
    let raf = 0;
    let shown = -1;
    const loop = () => {
      const ms = elapsedMs + Math.max(0, performance.now() - receivedAt);
      const t = Math.floor(ms / 100);
      if (t !== shown) { shown = t; setTick({ key, ms: t * 100 }); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, still, elapsedMs, receivedAt, key]);
  if (!running || still || !tick || tick.key !== key) return elapsedMs;
  return Math.max(elapsedMs, tick.ms);
}
