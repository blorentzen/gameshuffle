// Refreshes the time trial record floor (picks 2026-10-29, 8A) from mkwrs.com and writes
// src/data/time-trials-records.ts. Run: npx tsx scripts/pull-tt-records.ts [--dry]
// The monthly check (/api/cron/tt-records) emails when a record is faster than this file.
import fs from "node:fs";
import { MKWRS_PAGES, parseMk8dx, parseMkworld } from "../src/lib/timeTrials/recordsParse";
import { ttTracks } from "../src/lib/timeTrials/tracks";
import { formatTime } from "../src/lib/timeTrials/rules";

async function page(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "GameShuffle time trials record check (gameshuffle.co)" } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

async function main() {
  const dry = process.argv.includes("--dry");
  const a = parseMk8dx(await page(MKWRS_PAGES.mk8dx));
  const b = parseMkworld(await page(MKWRS_PAGES.mkworld));
  const all = [...a.records, ...b.records];
  const have = new Set(all.map((r) => `${r.game}:${r.trackId}:${r.cc}`));
  const want = [...ttTracks("mk8dx").flatMap((t) => [150, 200].map((c) => `mk8dx:${t.id}:${c}`)), ...ttTracks("mkworld").map((t) => `mkworld:${t.id}:150`)];
  const missing = want.filter((k) => !have.has(k));
  if (a.unknown.length || b.unknown.length) console.log("Names we couldn't place:", [...a.unknown, ...b.unknown].join(", "));
  if (missing.length) console.log("No record found for:", missing.join(", "));
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const lines = all.sort((x, y) => `${x.game}${x.trackId}${x.cc}`.localeCompare(`${y.game}${y.trackId}${y.cc}`))
    .map((r) => `  "${r.game}:${r.trackId}:${r.cc}": ${r.ms}, // ${formatTime(r.ms)} ${r.name}`);
  const file = `/**
 * World records per track and speed class, with mushrooms, from mkwrs.com (checked ${day}).
 * Written by scripts/pull-tt-records.ts; the monthly check (/api/cron/tt-records) emails when a
 * record gets faster. Used as the floor: no time faster than a track's record can be saved (8A).
 * Keys: "<game>:<track id>:<cc>", values in ms.
 */

export const TT_RECORDS_CHECKED = "${day}";

export const TT_RECORDS: Record<string, number> = {
${lines.join("\n")}
};
`;
  console.log(`${all.length} records (${want.length} tracks and classes, ${missing.length} without one).`);
  if (dry) return;
  fs.writeFileSync("src/data/time-trials-records.ts", file);
  console.log("Wrote src/data/time-trials-records.ts");
}

main().catch((e) => { console.error(e); process.exit(1); });
