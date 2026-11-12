/**
 * What Shuffle Kart keeps in this browser (client): your best run per track
 * (time, best lap and its ghost), your best lap, the mute switch, and the
 * seed for your generated avatar when you're signed out. One localStorage key,
 * read through useSyncExternalStore so the page and the race agree.
 */

import { useMemo, useSyncExternalStore } from "react";
import type { GhostData } from "@/lib/kart/ghost";

const KEY = "gs-kart";
const EVENT = "gs-kart-saves";

export interface TrackBest {
  totalMs: number;
  lapMs: number[];
  kart: string;
  ghost: GhostData | null;
}

export interface KartSaves {
  v: 1;
  bests: Record<string, TrackBest>;
  bestLaps: Record<string, number>;
  muted: boolean;
  guest: string | null;
}

const EMPTY: KartSaves = { v: 1, bests: {}, bestLaps: {}, muted: false, guest: null };

function read(raw: string | null): KartSaves {
  if (!raw) return EMPTY;
  try {
    const s = JSON.parse(raw) as Partial<KartSaves>;
    return { ...EMPTY, ...s, bests: s.bests ?? {}, bestLaps: s.bestLaps ?? {} };
  } catch {
    return EMPTY;
  }
}

function subscribe(cb: () => void): () => void {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

function snapshot(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Your saves (empty on the server and before the page has loaded them). */
export function useKartSaves(): KartSaves {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  return useMemo(() => read(raw), [raw]);
}

export function writeSaves(change: (s: KartSaves) => KartSaves): void {
  try {
    const next = change(read(localStorage.getItem(KEY)));
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the race still works, it just isn't kept.
    try {
      const next = change(read(localStorage.getItem(KEY)));
      localStorage.setItem(KEY, JSON.stringify({ ...next, bests: Object.fromEntries(Object.entries(next.bests).map(([k, b]) => [k, { ...b, ghost: null }])) }));
    } catch {
      /* nothing to do */
    }
  }
  window.dispatchEvent(new Event(EVENT));
}

export interface Saved {
  newBest: boolean;
  newBestLap: boolean;
  previous: TrackBest | null;
}

/** Keeps a finished race if it beats your best (and its fastest lap if that's a best). */
export function keepResult(trackKey: string, totalMs: number, lapMs: number[], kart: string, ghost: GhostData | null): Saved {
  let out: Saved = { newBest: false, newBestLap: false, previous: null };
  writeSaves((s) => {
    const prev = s.bests[trackKey] ?? null;
    const lap = lapMs.length ? Math.min(...lapMs) : Infinity;
    const prevLap = s.bestLaps[trackKey] ?? Infinity;
    const newBest = !prev || totalMs < prev.totalMs;
    const newBestLap = lap < prevLap;
    out = { newBest, newBestLap, previous: prev };
    return {
      ...s,
      bests: newBest ? { ...s.bests, [trackKey]: { totalMs, lapMs, kart, ghost } } : s.bests,
      bestLaps: newBestLap ? { ...s.bestLaps, [trackKey]: lap } : s.bestLaps,
    };
  });
  return out;
}
