/**
 * Checks for the Daily leaderboards' rules (src/lib/daily/boardRules.ts):
 *   npx tsx scripts/test-daily-boards.ts
 */

import { DEFAULT_LEVERS, ordinal, parsePlayer, periodRange, playerKey, pointsFor, prizeFor, settlesOn, tidyName } from "../src/lib/daily/boardRules";

let failed = 0, passed = 0;
const check = (ok: boolean, what: string) => { if (ok) passed++; else { failed++; console.error(`✗ ${what}`); } };
const eq = (a: unknown, b: unknown, what: string) => check(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// Points
eq([1, 2, 3, 4, 5].map((g) => pointsFor(g, true, 5)), [10, 8, 6, 4, 2], "solves on guesses 1 to 5");
eq(pointsFor(6, true, 5), 1, "a last-chance save");
eq(pointsFor(6, false, 5), 0, "a miss");
eq(pointsFor(6, true, 6), 2, "guess 6 in a six-guess game never drops below 2");

// Periods (Pacific days; weeks Monday to Sunday)
eq(periodRange("day", "2026-10-16"), { from: "2026-10-16", to: "2026-10-16" }, "a day");
eq(periodRange("week", "2026-10-16"), { from: "2026-10-12", to: "2026-10-18" }, "a Friday's week");
eq(periodRange("week", "2026-10-12"), { from: "2026-10-12", to: "2026-10-18" }, "a Monday's week");
eq(periodRange("week", "2026-10-18"), { from: "2026-10-12", to: "2026-10-18" }, "a Sunday's week");
eq(periodRange("month", "2026-10-16"), { from: "2026-10-01", to: "2026-10-31" }, "October");
eq(periodRange("month", "2026-02-10"), { from: "2026-02-01", to: "2026-02-28" }, "February");
eq(periodRange("month", "2028-02-10"), { from: "2028-02-01", to: "2028-02-29" }, "a leap February");
eq(periodRange("month", "2026-12-31"), { from: "2026-12-01", to: "2026-12-31" }, "December");
eq(periodRange("week", "2026-11-01"), { from: "2026-10-26", to: "2026-11-01" }, "a week across the daylight saving change");

// Settling: two days after the last day
eq(settlesOn("week", "2026-10-12"), "2026-10-20", "a week settles on Tuesday");
eq(settlesOn("month", "2026-10-01"), "2026-11-02", "a month settles on the 2nd");

// Prizes
const L = DEFAULT_LEVERS;
eq([1, 2, 3, 4, 10, 11].map((p) => prizeFor(p, "week", L)), [500, 300, 200, 100, 100, 0], "week prizes");
eq([1, 2, 3, 7, 10, 11].map((p) => prizeFor(p, "month", L)), [2500, 1500, 1000, 250, 250, 0], "month prizes");
eq(prizeFor(0, "week", L), 0, "no place, no prize");
eq(prizeFor(4, "week", { ...L, places: 3 }), 0, "fewer prize places");

// Players and names
eq(parsePlayer(playerKey("g", "abc")), { kind: "g", id: "abc" }, "player keys round-trip");
eq(parsePlayer("x:abc"), null, "unknown player kinds are refused");
eq([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th"], "ordinals");
eq(tidyName("  Sam   the   Great  "), "Sam the Great", "names tidy their spaces");
eq(tidyName("x".repeat(40)).length, 24, "names stop at 24 characters");

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
