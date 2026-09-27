/**
 * Personalized randomizers, the light half: the collection shape, reading it,
 * and filtering a randomizer's pool. No game data here, so randomizer pages
 * don't carry every game's catalog; the editor loads that (./catalog) on demand.
 */

import type { GameData } from "@/data/types";

export interface GameCollection {
  /** Randomizers respect the collection. Off = use everything this time. */
  enabled: boolean;
  /** Section id -> ids switched off. */
  off: Record<string, string[]>;
  /** Per-game preferences (Mario Party: edition, unlocked modes). */
  prefs: Record<string, unknown>;
}

export const SECTION_LABELS: Record<string, string> = {
  tracks: "tracks", characters: "characters", vehicles: "karts and bikes", wheels: "wheels", gliders: "gliders", boards: "boards",
};

export function emptyCollection(): GameCollection {
  return { enabled: true, off: {}, prefs: {} };
}

/** Normalize stored data; `defaults` fills in a game's starting state (locked items off). */
export function readCollection(raw: unknown, defaults: GameCollection = emptyCollection()): GameCollection {
  if (!raw || typeof raw !== "object") return defaults;
  const r = raw as Partial<GameCollection>;
  const off: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(r.off ?? {})) if (Array.isArray(v)) off[k] = v.map(String);
  return { enabled: r.enabled !== false, off: r.off ? off : defaults.off, prefs: r.prefs && typeof r.prefs === "object" ? r.prefs : {} };
}

export function offSet(col: GameCollection | null, section: string): Set<string> {
  return new Set(col?.enabled ? col.off[section] ?? [] : []);
}

/** "48 tracks, 2 characters left out" (sections with nothing off are skipped). */
export function summarize(col: GameCollection): string {
  const parts = Object.entries(col.off).filter(([, ids]) => ids.length).map(([s, ids]) => `${ids.length} ${SECTION_LABELS[s] ?? s}`);
  return parts.length ? `${parts.join(", ")} left out` : "Everything is in";
}

/**
 * Mario Kart: the game data with switched-off characters, vehicles, wheels,
 * gliders and tracks (ids `c{cup}-t{course}`) removed; empty cups are dropped.
 * Each pool keeps at least one entry, so "untick everything" can't break a roll.
 */
export function applyToKartData(data: GameData, col: GameCollection | null): GameData {
  if (!col?.enabled) return data;
  const keep = <T extends { name: string }>(rows: T[] | undefined, section: string): T[] | undefined => {
    if (!rows) return rows;
    const off = offSet(col, section);
    const left = rows.filter((r) => !off.has(r.name));
    return left.length ? left : rows;
  };
  const trackOff = offSet(col, "tracks");
  const cups = data.cups?.map((cup, ci) => ({ ...cup, courses: cup.courses.filter((_, ti) => !trackOff.has(`c${ci}-t${ti}`)) })).filter((c) => c.courses.length);
  return {
    ...data,
    characters: keep(data.characters, "characters")!,
    vehicles: keep(data.vehicles, "vehicles")!,
    wheels: keep(data.wheels, "wheels"),
    gliders: keep(data.gliders, "gliders"),
    cups: cups?.length ? cups : data.cups,
  };
}
