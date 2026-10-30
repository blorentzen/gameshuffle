/**
 * Reading world records from mkwrs.com (the community's Mario Kart time trial record site), for the
 * record floor (picks 2026-10-29, 8A): nobody can save a time faster than a track's record. Pure, so
 * the refresh script (scripts/pull-tt-records.ts) and the monthly check (/api/cron/tt-records) share
 * it. Records are with mushrooms, like our boards.
 */

import { parseTime } from "./rules";
import { plainName, ttTracks, type TtClass, type TtGame } from "./tracks";

export const MKWRS_PAGES: Record<TtGame, string> = {
  mk8dx: "https://mkwrs.com/mk8dx/",
  mkworld: "https://mkwrs.com/mkworld/",
};

export interface ParsedRecord { game: TtGame; trackId: string; cc: TtClass; ms: number; name: string }

const TIME = /(\d{1,2}'\d{2}"\d{3})/g;

function clean(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
}

/** mkwrs spellings that differ from ours. */
const NAME_FIX: Record<string, string> = { "sherbert land": "sherbet land", "yoshi island": "yoshi's island", electrodome: "electrodrome" };

function key(name: string): string {
  let k = plainName(name);
  for (const [a, b] of Object.entries(NAME_FIX)) k = k.replace(plainName(a), plainName(b));
  return k;
}

function trackIndex(game: TtGame): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of ttTracks(game)) m.set(key(t.name), t.id);
  return m;
}

/** "1'33\"628" → ms (the record pages write times the way the games do). */
function ms(text: string): number | null {
  return parseTime(text);
}

/**
 * Mario Kart 8 Deluxe page: one block per track, the 150cc record then the 200cc one. Returns the
 * records it could place and the track names it couldn't.
 */
export function parseMk8dx(html: string): { records: ParsedRecord[]; unknown: string[] } {
  const index = trackIndex("mk8dx");
  const records: ParsedRecord[] = [];
  const unknown: string[] = [];
  const blocks = html.split(/<table class=\s*"track">/).slice(1);
  for (const block of blocks) {
    const nameM = block.match(/<a href="display\.php\?track=[^"]*">([^<]+)<\/a>/);
    if (!nameM) continue;
    const name = clean(nameM[1]);
    const times = [...block.matchAll(TIME)].map((m) => ms(m[1]));
    // mkwrs puts "Tour" on the three Booster courses that began in Tour (Ninja Hideaway, Merry Mountain, Piranha Plant Cove).
    const id = index.get(key(name)) ?? index.get(key(name.replace(/^Tour /, "")));
    if (!id) { unknown.push(name); continue; }
    if (times[0]) records.push({ game: "mk8dx", trackId: id, cc: 150, ms: times[0], name });
    if (times[1]) records.push({ game: "mk8dx", trackId: id, cc: 200, ms: times[1], name });
  }
  return { records, unknown };
}

/**
 * Mario Kart World page: one row per course at 150cc. A "(Glitch)" row is a separate category; the
 * faster of the two is the floor, so a real glitch run is never refused.
 */
export function parseMkworld(html: string): { records: ParsedRecord[]; unknown: string[] } {
  const index = trackIndex("mkworld");
  const best = new Map<string, ParsedRecord>();
  const unknown: string[] = [];
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
  for (const row of rows) {
    const nameM = row.match(/<a href="display\.php\?track=[^"]*">([^<]+)<\/a>/);
    const timeM = row.match(TIME);
    if (!nameM || !timeM) continue;
    const raw = clean(nameM[1]);
    const name = raw.replace(/\s*\((glitch|no glitch|shortcut|non-?glitch)\)\s*$/i, "");
    const t = ms(timeM[0]);
    const id = index.get(key(name)) ?? index.get(key(`SNES ${name}`));
    if (!id) { if (!unknown.includes(raw)) unknown.push(raw); continue; }
    if (!t) continue;
    const had = best.get(id);
    if (!had || had.ms > t) best.set(id, { game: "mkworld", trackId: id, cc: 150, ms: t, name });
  }
  return { records: [...best.values()], unknown };
}
