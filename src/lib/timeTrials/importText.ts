/**
 * Reading a pasted list of times (picks 2026-10-29, Q1: a paste import, so people
 * can bring their times from Quaxly or a spreadsheet; they confirm every row before
 * anything saves). Client-safe: the line reader is pure. When it can't read most
 * lines, the server asks Claude (importServer.ts).
 */

import { parseTime } from "./rules";
import { TT_GAMES, type TtClass, type TtGame } from "./tracks";
import { learnedHit, trackFor, type Learned } from "./quaxly";

export interface ImportRow {
  line: string;
  game: TtGame;
  trackId: string | null;
  trackName: string | null;
  /** What the line called the track, when it didn't match one of ours. */
  trackText: string | null;
  cc: TtClass;
  timeMs: number | null;
  /** How the track was matched, when it wasn't by name or a standard short name: AI, or a short name players taught us. */
  via?: "ai" | "learned" | null;
  /** A video of the run that came with it (MKCentral's proofs): saved as the clip for a reviewer to check. */
  video?: string | null;
}

/** A time: m:ss.mmm in any of the usual spellings, or the Players' Page's under-a-minute ss"mmm. */
const TIME = /(\d{1,2}[:'.]\d{2}[."':,]\d{1,3}|(?<![\d:'.])\d{2}["″]\d{3}(?!\d))/;
const CC = /\b(150|200)\s*cc\b|\b(150|200)\b(?=\s*$)/i;
/** A list's totals or summary line ("Subtotals", "total time: 2h 54m…"), never a track. */
const SUMMARY = /^(sub)?totals?\b|^average\b|^overall\b/i;

function clean(text: string): string {
  return text
    .replace(/^\s*(\d+[.)]|[-*•#|])\s*/, "")
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/[|:–—-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The track on a line: the text before the time first, cell by cell (a spreadsheet's or a profile
 * table's columns: "MKS | Mario Kart Stadium | 1:35.258 | 9", "(DS) Desert Hills<TAB>1'47\"123<TAB>4"),
 * then everything but the time. Returns the track and the text tried when nothing matched.
 */
function lineTrack(line: string, time: string, game: TtGame, learned?: Learned | null): { track: ReturnType<typeof trackFor>; text: string; learned: boolean } {
  const at = line.indexOf(time);
  const before = line.slice(0, at);
  const cells = before.split(/\t|\s\|\s|\|/).map(clean).filter(Boolean);
  for (const c of [...cells, clean(before)]) {
    const t = trackFor(c, game, learned);
    if (t) return { track: t, text: c, learned: learnedHit(c, game, learned) };
  }
  const rest = clean(line.replace(time, " ").replace(CC, " "));
  const t = rest ? trackFor(rest, game, learned) : null;
  return { track: t, text: cells[cells.length - 1] ?? rest, learned: t ? learnedHit(rest, game, learned) : false };
}

/** One row per line that has a time in it. Track and class come from the rest of the line, or a heading above it. */
export function readLines(text: string, game: TtGame, learned?: Learned | null): ImportRow[] {
  const classes = TT_GAMES[game].classes;
  const rows: ImportRow[] = [];
  let headingCc: number | null = null;
  for (const raw of text.split(/\r?\n/).slice(0, 400)) {
    const line = raw.trim();
    if (!line || SUMMARY.test(line)) continue;
    const m = line.match(TIME);
    if (!m) {
      // A heading like "Switch-150cc Course" or "200cc" sets the class for the rows under it.
      const h = line.match(/\b(150|200)\s*cc\b/i);
      if (h) headingCc = Number(h[1]);
      continue;
    }
    const timeMs = parseTime(m[1]);
    // Class from the rest of the line, so a time ending in .150 or .200 isn't read as one.
    const ccMatch = line.replace(m[1], " ").match(CC);
    const ccNum = ccMatch ? Number(ccMatch[1] ?? ccMatch[2]) : headingCc ?? classes[0];
    const cc = ((classes as number[]).includes(ccNum) ? ccNum : classes[0]) as TtClass;
    const found = lineTrack(line, m[1], game, learned);
    rows.push({ line: line.slice(0, 200), game, trackId: found.track?.id ?? null, trackName: found.track?.name ?? null, trackText: found.track ? null : found.text || null, cc, timeMs, via: found.learned ? "learned" : null });
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
