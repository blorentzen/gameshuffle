/**
 * Your dailies (choose your dailies, 2026-11-09): the pure rules in src/lib/originals/dailies.ts.
 *
 *   npx tsx scripts/test-daily-picks.ts
 */

import {
  DEFAULT_DAILY_PICKS, availableDailies, barCells, cleanDailyPicks, combinedShareText, dailiesShown, picksOrDefault, sharedToday, withPicks,
  type DailiesEntries, type DailyGameId,
} from "../src/lib/originals/dailies";
import { gsDay, gsWeekStart } from "../src/lib/time/gsClock";

let failed = 0, passed = 0;
function eq(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passed++;
  else { failed++; console.error(`✗ ${label}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); }
}

const ALL: DailyGameId[] = ["shuffle", "dex", "fire", "duel"];
const ACTIVITY: DailyGameId[] = ["shuffle", "dex"];

// Cleaning: known ids only, each once, in the dailies' order; nothing usable = null.
eq("clean keeps order", cleanDailyPicks(["duel", "shuffle", "duel"]), ["shuffle", "duel"]);
eq("clean drops the Weekly and unknowns", cleanDailyPicks(["weekly", "bogus", "dex"]), ["dex"]);
eq("clean empty", cleanDailyPicks([]), null);
eq("clean only unknowns", cleanDailyPicks(["weekly"]), null);
eq("clean not a list", cleanDailyPicks("shuffle"), null);
eq("clean null", cleanDailyPicks(null), null);

// Default four: frozen, never grows by itself.
eq("default four", [...DEFAULT_DAILY_PICKS], ["shuffle", "dex", "fire", "duel"]);
eq("never chose = default", picksOrDefault(null, ALL), ALL);
eq("own list", picksOrDefault(["fire", "shuffle"], ALL), ["shuffle", "fire"]);
eq("own list in the Activity", picksOrDefault(["fire", "shuffle"], ACTIVITY), ["shuffle"]);
eq("only Fire in the Activity = none here", picksOrDefault(["fire"], ACTIVITY), []);
eq("broken list = default", picksOrDefault(["bogus"], ALL), ALL);
// A daily that isn't public here stays out of the default too.
eq("default kept to what's shown", picksOrDefault(null, ["shuffle", "fire"]), ["shuffle", "fire"]);
eq("available on the site (development shows all)", availableDailies(), ALL);
eq("available in the Activity", availableDailies({ fire: false, duel: false }), ACTIVITY);

// The bar: your picks, the one you're on, and what's left for More.
eq("bar all four", barCells(ALL, ALL, "shuffle"), { cells: ALL, hidden: [] });
eq("bar two picks on a picked one", barCells(ALL, ["shuffle", "dex"], "shuffle"), { cells: ["shuffle", "dex"], hidden: ["fire", "duel"] });
eq("bar keeps the one you're on", barCells(ALL, ["shuffle", "dex"], "duel"), { cells: ["shuffle", "dex", "duel"], hidden: ["fire"] });
eq("bar on the Weekly", barCells(ALL, ["fire"], "weekly"), { cells: ["fire"], hidden: ["shuffle", "dex", "duel"] });
eq("bar in the Activity, Fire only", barCells(ACTIVITY, [], "shuffle"), { cells: ["shuffle"], hidden: ["dex"] });
// Five dailies one day: four in a row, the one you're on kept.
const ZZZ = "zzz" as string as DailyGameId;
const FIVE = [...ALL, ZZZ];
eq("bar caps at four, keeps current", barCells(FIVE, FIVE, ZZZ), { cells: ["shuffle", "dex", "fire", ZZZ], hidden: ["duel"] });
eq("bar caps at four", barCells(FIVE, FIVE, "shuffle"), { cells: ALL, hidden: [ZZZ] });

// What a page works with: picks, the current one, the Weekly.
const shown = dailiesShown();
eq("withPicks", withPicks(shown, ["dex"], "duel"), ["dex", "duel", "weekly"]);
eq("withPicks without a page game", withPicks(shown, ["shuffle", "fire"], null), ["shuffle", "fire", "weekly"]);

// The combined share uses only your dailies (plus the one you're on and the Weekly).
const day = gsDay(), week = gsWeekStart();
const entries: DailiesEntries = {
  shuffle: { day, number: 42, state: "done", result: { guesses: 3, main: 5, solved: true, saved: false, seconds: 42 } },
  dex: { day, number: 25, state: "done", result: { guesses: 2, main: 5, solved: true, saved: false } },
  fire: { day, number: 21, state: "done", fire: { score: 1240, right: 14 } },
  weekly: { day: week, number: 7, state: "done" },
};
const mine = withPicks(shown, ["shuffle", "fire"], "shuffle");
eq("shared today, your dailies", sharedToday(entries, mine), ["shuffle", "fire", "weekly"]);
const text = combinedShareText(entries, mine);
eq("combined text leaves the Dex out", text.includes("Daily Dex"), false);
eq("combined text has Fire Round", text.includes("Fire Round #21"), true);

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
