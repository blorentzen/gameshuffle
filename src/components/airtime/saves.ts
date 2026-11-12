/**
 * What Airtime keeps in this browser (client): your best score (and the level
 * it reached), the mute switch, and the seed for your generated avatar when
 * you're signed out. One localStorage key, read through useSyncExternalStore
 * so the page and the run agree. Storage failing never stops the game.
 */

import { useMemo, useSyncExternalStore } from "react";

const KEY = "gs-airtime";
const EVENT = "gs-airtime-saves";

export interface AirtimeSaves {
  v: 1;
  best: number;
  /** Levels cleared on the best run. */
  bestLevels: number;
  muted: boolean;
  guest: string | null;
}

const EMPTY: AirtimeSaves = { v: 1, best: 0, bestLevels: 0, muted: false, guest: null };

function read(raw: string | null): AirtimeSaves {
  if (!raw) return EMPTY;
  try {
    const s = JSON.parse(raw) as Partial<AirtimeSaves>;
    return { ...EMPTY, ...s, best: Number(s.best) || 0, bestLevels: Number(s.bestLevels) || 0 };
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
export function useAirtimeSaves(): AirtimeSaves {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  return useMemo(() => read(raw), [raw]);
}

export function writeSaves(change: (s: AirtimeSaves) => AirtimeSaves): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(change(read(localStorage.getItem(KEY)))));
  } catch {
    // Storage full or blocked: the game still works, it just isn't kept.
  }
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* nothing to do */
  }
}

/** Keeps a finished run's score if it's your best. Returns whether it was, and the old best. */
export function keepScore(score: number, levels: number): { newBest: boolean; previous: number } {
  let out = { newBest: false, previous: 0 };
  writeSaves((s) => {
    const newBest = score > s.best;
    out = { newBest, previous: s.best };
    return newBest ? { ...s, best: score, bestLevels: levels } : s;
  });
  return out;
}
