/**
 * Reading a pasted list of times (picks 2026-10-29, Q1: a paste import, so people
 * can bring their times from Quaxly or a spreadsheet; they confirm every row before
 * anything saves). Client-safe: the line reader is pure. When it can't read most
 * lines, the server asks Claude (importServer.ts).
 */

import { parseTime } from "./rules";
import { TT_GAMES, type TtClass, type TtGame } from "./tracks";
import { trackFor } from "./quaxly";

export interface ImportRow {
  line: string;
  game: TtGame;
  trackId: string | null;
  trackName: string | null;
  /** What the line called the track, when it didn't match one of ours. */
  trackText: string | null;
  cc: TtClass;
  timeMs: number | null;
}

const TIME = /(\d{1,2}[:'.]\d{2}[."':,]\d{1,3})/;
const CC = /\b(150|200)\s*cc\b|\b(150|200)\b(?=\s*$)/i;

/** One row per line that has a time in it. Track and class come from the rest of the line. */
export function readLines(text: string, game: TtGame): ImportRow[] {
  const classes = TT_GAMES[game].classes;
  const rows: ImportRow[] = [];
  for (const raw of text.split(/\r?\n/).slice(0, 400)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(TIME);
    if (!m) continue;
    const timeMs = parseTime(m[1]);
    // Class from the rest of the line, so a time ending in .150 or .200 isn't read as one.
    const ccMatch = line.replace(m[1], " ").match(CC);
    const ccNum = ccMatch ? Number(ccMatch[1] ?? ccMatch[2]) : classes[0];
    const cc = ((classes as number[]).includes(ccNum) ? ccNum : classes[0]) as TtClass;
    const rest = line
      .replace(m[1], " ")
      .replace(CC, " ")
      .replace(/^\s*(\d+[.)]|[-*•#|])\s*/, "")
      .replace(/[|:–—-]+/g, " ")
      .replace(/\(.*?\)|\[.*?\]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const track = rest ? trackFor(rest, game) : null;
    rows.push({ line: line.slice(0, 200), game, trackId: track?.id ?? null, trackName: track?.name ?? null, trackText: track ? null : rest || null, cc, timeMs });
  }
  return rows;
}

/** Whether the line reader got enough: most lines with a time matched a track. */
export function linesLookRight(rows: ImportRow[]): boolean {
  if (!rows.length) return false;
  const good = rows.filter((r) => r.trackId && r.timeMs).length;
  return good / rows.length >= 0.8;
}

/** Keeps one row per track and class: the fastest. */
export function bestPerTrack(rows: ImportRow[]): ImportRow[] {
  const best = new Map<string, ImportRow>();
  for (const r of rows) {
    if (!r.trackId || !r.timeMs) continue;
    const key = `${r.trackId}|${r.cc}`;
    const had = best.get(key);
    if (!had || (had.timeMs ?? Infinity) > r.timeMs) best.set(key, r);
  }
  return [...best.values()];
}
