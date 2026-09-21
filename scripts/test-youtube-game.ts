/**
 * Unit test for resolveYouTubeGameFromTitle — YouTube broadcast title → game slug.
 * Run: npx tsx scripts/test-youtube-game.ts
 */

import { resolveYouTubeGameFromTitle } from "../src/lib/youtube/games";

const cases: [string | null | undefined, string | null][] = [
  // World
  ["Mario Kart World races w/ viewers!", "mario-kart-world"],
  ["MKWorld Monday", "mario-kart-world"],
  ["mk world speedruns", "mario-kart-world"],
  ["MKW grind", "mario-kart-world"],
  // 8 Deluxe
  ["Mario Kart 8 Deluxe time trials", "mario-kart-8-deluxe"],
  ["MK8DX ranked", "mario-kart-8-deluxe"],
  ["MK8 with chat", "mario-kart-8-deluxe"],
  ["Mario Kart Deluxe grind", "mario-kart-8-deluxe"],
  // World wins when both could appear, and "world record" alone doesn't trip world
  ["Mario Kart 8 Deluxe world record attempts", "mario-kart-8-deluxe"],
  // Ambiguous / unrelated / empty → queue mode (null)
  ["Mario Kart Mondays!", null],
  ["Just chatting today", null],
  ["Elden Ring blind run", null],
  ["", null],
  [null, null],
  [undefined, null],
];

let pass = 0;
let fail = 0;
for (const [title, expected] of cases) {
  const got = resolveYouTubeGameFromTitle(title);
  if (got === expected) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${JSON.stringify(title)} → got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
  }
}

console.log(`\n${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
