/**
 * A format-agnostic view of a tournament's ordered "races", so one "current
 * race" pointer works across every format:
 *   • ffa_points / round_robin → the planned track list (settings.tracks),
 *     falling back to numbered races from settings.raceCount.
 *   • heat_mains → the heats then the mains (each HRace carries its own label).
 *   • single_elim / double_elim → the bracket matches in play order.
 *
 * The pointer is stored as `settings.currentRaceKey` (a RaceRef.key). Prev/next
 * just move to the adjacent key in this list. Pure + client-safe — used by the
 * manage page, the public page, the live page, the API route, and the chat
 * command alike.
 */

import type { Bracket } from "./bracket";
import type { HeatMains } from "./heatMains";

export interface RaceRef {
  /** Stable key within the tournament: track index (ffa), match id (bracket),
   *  or HRace id (heat_mains). */
  key: string;
  /** Short label, e.g. "Race 3", "A Main", "WB · R1 M2". */
  label: string;
  /** Optional secondary line — the track name for ffa. */
  sublabel?: string | null;
  /** Optional image (track art for ffa). */
  img?: string | null;
}

interface TrackLite {
  id?: string;
  name?: string;
  img?: string;
}

export interface RaceSource {
  format?: string | null;
  settings?: {
    tracks?: TrackLite[];
    raceCount?: number;
    currentRaceKey?: string | null;
    [k: string]: unknown;
  } | null;
  bracket?: Bracket | null;
  heat_mains?: HeatMains | null;
}

const GROUP_ORDER: Record<string, number> = { wb: 0, lb: 1, gf: 2 };

/** The ordered list of races for a tournament, whatever its format. */
export function listRaces(t: RaceSource): RaceRef[] {
  const fmt = t.format ?? "ffa_points";

  if (fmt === "single_elim" || fmt === "double_elim") {
    const matches = t.bracket?.matches ?? [];
    return [...matches]
      .sort(
        (a, b) =>
          (GROUP_ORDER[a.group] ?? 9) - (GROUP_ORDER[b.group] ?? 9) ||
          a.round - b.round ||
          a.slot - b.slot,
      )
      .map((m) => ({
        key: m.id,
        label: `${m.group.toUpperCase()} · R${m.round + 1} M${m.slot + 1}`,
        sublabel: null,
      }));
  }

  if (fmt === "heat_mains") {
    const hm = t.heat_mains;
    if (!hm) return [];
    return [...hm.heats, ...hm.mains].map((r) => ({ key: r.id, label: r.label }));
  }

  // ffa_points / round_robin / default → the track list.
  const tracks = t.settings?.tracks ?? [];
  if (tracks.length) {
    return tracks.map((tr, i) => ({
      key: String(i),
      label: `Race ${i + 1}`,
      sublabel: tr.name ?? null,
      img: tr.img ?? null,
    }));
  }
  const rc = t.settings?.raceCount ?? 0;
  return Array.from({ length: rc }, (_, i) => ({ key: String(i), label: `Race ${i + 1}` }));
}

/** Index of `key` in the list, or -1. */
export function raceIndex(races: RaceRef[], key: string | null | undefined): number {
  if (key == null) return -1;
  return races.findIndex((r) => r.key === key);
}

/** The key one step from `key` in `dir` (+1 next, -1 prev); null past the ends.
 *  With no current pointer, next → first, prev → last. */
export function adjacentRaceKey(
  races: RaceRef[],
  key: string | null | undefined,
  dir: 1 | -1,
): string | null {
  if (!races.length) return null;
  const i = raceIndex(races, key);
  if (i === -1) return dir === 1 ? races[0].key : races[races.length - 1].key;
  const j = i + dir;
  if (j < 0 || j >= races.length) return null;
  return races[j].key;
}

/** Resolve the current RaceRef (or null) from a tournament + its stored pointer. */
export function currentRace(t: RaceSource): { race: RaceRef | null; index: number; total: number } {
  const races = listRaces(t);
  const index = raceIndex(races, t.settings?.currentRaceKey ?? null);
  return { race: index >= 0 ? races[index] : null, index, total: races.length };
}
