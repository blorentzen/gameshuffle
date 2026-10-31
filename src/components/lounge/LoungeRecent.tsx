"use client";

/**
 * "Looked up lately" (lookup picks, 2026-10-21): the last five lounge players opened on this
 * device, kept in localStorage (`gs-lounge-recent`). Read after hydration only, so the server's
 * HTML and the first browser paint match; storage that throws (private windows) reads as empty.
 */

import { useEffect, useSyncExternalStore } from "react";
import { isMmrGame, type MmrGame } from "@/lib/mmr/rules";

export interface RecentLookup { name: string; game: MmrGame; division: string | null }

const KEY = "gs-lounge-recent";
const EVENT = "gs-lounge-recent";
const MAX = 5;

function readRaw(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function parseRecent(raw: string | null): RecentLookup[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list
      .filter((r): r is RecentLookup => !!r && typeof r === "object" && typeof (r as RecentLookup).name === "string" && isMmrGame((r as RecentLookup).game))
      .map((r) => ({ name: r.name.slice(0, 40), game: r.game, division: typeof r.division === "string" ? r.division : null }))
      .slice(0, MAX);
  } catch { return []; }
}

export function rememberLookup(entry: RecentLookup) {
  try {
    const list = parseRecent(readRaw()).filter((r) => r.name.toLowerCase() !== entry.name.toLowerCase());
    localStorage.setItem(KEY, JSON.stringify([entry, ...list].slice(0, MAX)));
    window.dispatchEvent(new Event(EVENT));
  } catch { /* no storage: nothing to remember */ }
}

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => { window.removeEventListener("storage", cb); window.removeEventListener(EVENT, cb); };
};

/** The raw stored list (a string, so the snapshot is stable); null on the server and before hydration. */
export function useRecentRaw(): string | null {
  return useSyncExternalStore(subscribe, readRaw, () => null);
}

/** Notes a player page as looked up. Renders nothing. */
export function RememberLookup(entry: RecentLookup) {
  const { name, game, division } = entry;
  useEffect(() => { rememberLookup({ name, game, division }); }, [name, game, division]);
  return null;
}
