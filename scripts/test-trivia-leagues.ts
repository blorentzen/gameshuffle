/**
 * Trivia league rules: points by place, ties, best-of standings, slugs.
 *   npx tsx scripts/test-trivia-leagues.ts
 */
import { champion, cleanSettings, defaultBestOf, leagueSlug, nextWeek, nightResults, placePoints, scoringLine, standings, type ResultRow } from "../src/lib/trivia/leagueRules";

let pass = 0, fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${label}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};

// Points by place
eq("1st", placePoints(1), 10);
eq("2nd", placePoints(2), 8);
eq("3rd", placePoints(3), 6);
eq("4th", placePoints(4), 5);
eq("5th", placePoints(5), 4);
eq("8th", placePoints(8), 1);
eq("20th", placePoints(20), 1);

// A night with a tie for second
const night = nightResults([{ teamId: "a", score: 40 }, { teamId: "b", score: 35 }, { teamId: "c", score: 35 }, { teamId: "d", score: 20 }], "place");
eq("places with a tie", night.map((r) => [r.teamId, r.place, r.points]), [["a", 1, 10], ["b", 2, 8], ["c", 2, 8], ["d", 4, 5]]);
eq("total scoring", nightResults([{ teamId: "a", score: 12 }, { teamId: "b", score: -3 }], "total").map((r) => r.points), [12, 0]);
eq("tie for first", nightResults([{ teamId: "x", score: 9 }, { teamId: "y", score: 9 }], "place").map((r) => [r.place, r.points]), [[1, 10], [1, 10]]);

// Best-of standings
const rows: ResultRow[] = [
  { teamId: "a", week: 1, place: 1, score: 50, points: 10 },
  { teamId: "b", week: 1, place: 2, score: 40, points: 8 },
  { teamId: "a", week: 2, place: 3, score: 30, points: 6 },
  { teamId: "b", week: 2, place: 1, score: 55, points: 10 },
  { teamId: "c", week: 2, place: 2, score: 45, points: 8 },
  { teamId: "a", week: 3, place: 2, score: 44, points: 8 },
  { teamId: "b", week: 3, place: 1, score: 60, points: 10 },
];
const s2 = standings(["a", "b", "c", "d"], rows, 2);
eq("best 2 ranks", s2.map((r) => [r.teamId, r.rank, r.points]), [["b", 1, 20], ["a", 2, 18], ["c", 3, 8], ["d", 4, 0]]);
eq("counted weeks", s2.find((r) => r.teamId === "a")!.counted, [1, 3]);
eq("previous rank", s2.map((r) => [r.teamId, r.previousRank]), [["b", 1], ["a", 2], ["c", 3], ["d", null]]);
const all = standings(["a", "b"], rows, 3);
eq("every night", all.map((r) => [r.teamId, r.points, r.nights, r.wins]), [["b", 28, 3, 2], ["a", 24, 3, 1]]);
// Tie broken by wins, then a real tie shares the rank
const tie = standings(["p", "q", "r"], [
  { teamId: "p", week: 1, place: 1, score: 1, points: 10 },
  { teamId: "q", week: 1, place: 3, score: 1, points: 6 },
  { teamId: "q", week: 2, place: 4, score: 1, points: 4 },
  { teamId: "r", week: 2, place: 1, score: 1, points: 10 },
], 5);
eq("wins break a points tie", tie.map((r) => [r.teamId, r.rank]), [["p", 1], ["r", 1], ["q", 3]]);
eq("no champion on a tie", champion(tie), null);
eq("champion", champion(s2), "b");

// Season helpers
eq("next week", nextWeek([1, 2], 8), 3);
eq("season over", nextWeek([1, 2, 3, 4], 4), null);
eq("first week", nextWeek([], 6), 1);
eq("best of 8", defaultBestOf(8), 6);
eq("best of 4", defaultBestOf(4), 4);
eq("clean settings", cleanSettings({ weeks: 6, teamSize: 99 as never, scoring: "total", bestOf: 9 }), { weeks: 6, teamSize: 6, scoring: "total", bestOf: 6, template: "bar", online: false });
eq("slug", leagueSlug("Tuesday Trivia at Pine Street Taproom!"), "tuesday-trivia-at-pine-street-taproom");
eq("slug accents", leagueSlug("Café Quiz & Co"), "cafe-quiz-and-co");
eq("short slug", leagueSlug("Q"), "trivia-league-q");
eq("scoring line has no long dash", /[–—]/.test(scoringLine(cleanSettings({}))), false);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
