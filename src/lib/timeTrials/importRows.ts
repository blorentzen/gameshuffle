/**
 * The check table's rows (import page and the Discord "Save to GameShuffle" command, migration picks
 * 2026-10-29): which rows come up ticked and why the others don't. Pure and client-safe.
 *
 * A row is ticked when it's readable, yours (3A), not faster than the world record (8A) and faster
 * than what you already have (5A). Of several rows for one track, only the fastest stays ticked.
 */

import { fasterThanRecord } from "./records";
import type { ImportRow } from "./importText";
import type { QuaxlyRow } from "./quaxly";
import type { TtClass, TtGame } from "./tracks";

export type RowNote = "unclear" | "others" | "record" | "already" | "duplicate" | null;

export interface CheckRow extends ImportRow {
  /** The name under the time on a server board. */
  holder: string | null;
  keep: boolean;
  note: RowNote;
  /** Your saved best on this track, when it's as fast or faster. */
  savedMs: number | null;
}

/** Quaxly rows (or plain paste rows, which have no holder) as check rows. `mine` = indexes of your rows. */
export function toCheckRows(rows: (QuaxlyRow | ImportRow)[], game: TtGame, cc: TtClass, mine: Set<number> | null, bests: Map<string, number>): CheckRow[] {
  const out: CheckRow[] = rows.map((r, i) => {
    const rowCc = "cc" in r ? r.cc : cc;
    const base: CheckRow = {
      line: r.line, game, trackId: r.trackId, trackName: r.trackName, trackText: r.trackId ? null : (r.trackText ?? null),
      cc: rowCc, timeMs: r.timeMs, holder: "holder" in r ? r.holder : null, keep: false, note: null, savedMs: null, via: r.via ?? null, video: r.video ?? null,
    };
    if (!r.trackId || !r.timeMs) return { ...base, note: "unclear" };
    if (mine && !mine.has(i)) return { ...base, note: "others" };
    if (fasterThanRecord(game, r.trackId, rowCc, r.timeMs)) return { ...base, note: "record" };
    const saved = bests.get(`${r.trackId}|${rowCc}`);
    if (saved != null && saved <= r.timeMs) return { ...base, note: "already", savedMs: saved };
    return { ...base, keep: true };
  });
  // One ticked row per track and class: the fastest.
  const fastest = new Map<string, number>();
  out.forEach((r, i) => {
    if (!r.keep) return;
    const k = `${r.trackId}|${r.cc}`;
    const j = fastest.get(k);
    if (j == null || (out[j].timeMs ?? Infinity) > (r.timeMs ?? Infinity)) fastest.set(k, i);
  });
  return out.map((r, i) => (r.keep && fastest.get(`${r.trackId}|${r.cc}`) !== i ? { ...r, keep: false, note: "duplicate" } : r));
}

/** Counts for a summary line. */
export function checkSummary(rows: CheckRow[]): { keep: number; already: number; unclear: number; record: number; others: number } {
  const n = (note: RowNote) => rows.filter((r) => r.note === note).length;
  return { keep: rows.filter((r) => r.keep).length, already: n("already"), unclear: n("unclear"), record: n("record"), others: n("others") };
}
