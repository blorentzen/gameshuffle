/**
 * Pure tests for the dailies together (co-op picks 2026-11-11): group streaks
 * (src/lib/daily/groupRules.ts) and the day board's race between places
 * (src/lib/daily/placeRace.ts).
 * Run: npx tsx scripts/test-daily-groups.ts
 */
import assert from "node:assert/strict";
import { crewNeeds, crewStreak, daysAmong, groupLine, peopleStreak, streakFrom, type SolvedDays } from "../src/lib/daily/groupRules";
import { isRace, raceTotals } from "../src/lib/daily/placeRace";
import { gsAddDays } from "../src/lib/time/gsClock";

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed += 1; console.log(`ok  ${name}`); };

const today = "2026-11-11";
const ago = (n: number) => gsAddDays(today, -n);
/** day offset → people who solved. */
const daysOf = (spec: Record<number, string[]>): SolvedDays => new Map(Object.entries(spec).map(([n, who]) => [ago(Number(n)), new Set(who)]));

test("a crew needs half its members (rounded up), never fewer than two", () => {
  assert.equal(crewNeeds(2), 2);
  assert.equal(crewNeeds(3), 2);
  assert.equal(crewNeeds(4), 2);
  assert.equal(crewNeeds(5), 3);
  assert.equal(crewNeeds(6), 3);
  assert.equal(crewNeeds(9), 5);
  assert.equal(crewNeeds(1), 1);
});

test("streaks run back from today when today counts, else from yesterday", () => {
  const days = daysOf({ 0: ["a", "b"], 1: ["a", "b"], 2: ["a", "b"], 3: ["a"], 4: ["a", "b"] });
  const two = (who: Set<string>) => who.size >= 2;
  assert.deepEqual(streakFrom(days, two, today), { streak: 3, today: true });
  const notYet = daysOf({ 0: ["a"], 1: ["a", "b"], 2: ["a", "b"] });
  assert.deepEqual(streakFrom(notYet, two, today), { streak: 2, today: false });
  const broken = daysOf({ 0: ["a"], 1: ["a"], 2: ["a", "b"] });
  assert.deepEqual(streakFrom(broken, two, today), { streak: 0, today: false });
  assert.deepEqual(streakFrom(new Map(), two, today), { streak: 0, today: false });
});

test("a streak never counts further back than the lookback", () => {
  const long: SolvedDays = new Map(Array.from({ length: 200 }, (_, i) => [ago(i), new Set(["a", "b"])]));
  assert.equal(streakFrom(long, (w) => w.size >= 2, today, 90).streak, 90);
});

test("daysAmong keeps only the group's people", () => {
  const all = daysOf({ 0: ["a", "x"], 1: ["x"] });
  const mine = daysAmong(all, new Set(["a", "b"]));
  assert.deepEqual([...mine.get(today)!], ["a"]);
  assert.equal(mine.has(ago(1)), false);
});

test("a crew's streak, its counts and its line", () => {
  const members = new Set(["me", "b", "c", "d", "e", "f"]); // needs 3
  const days = daysOf({ 0: ["me", "b", "c", "zz"], 1: ["me", "b", "d"], 2: ["c", "d", "e", "f"], 3: ["me"] });
  const s = crewStreak({ name: "Tuesday Karts", href: "/c/tk", members, days, today, me: "me" });
  assert.equal(s.needed, 3);
  assert.equal(s.solvedToday, 3); // "zz" isn't in the crew
  assert.equal(s.size, 6);
  assert.equal(s.youSolved, true);
  assert.deepEqual([s.streak, s.today], [3, true]);
  assert.equal(groupLine(s), "3 of 6 solved today: 3 days running.");
});

test("a crew one short today: the line says how many more keep it going", () => {
  const members = new Set(["me", "b", "c", "d"]); // needs 2
  const s = crewStreak({ name: "Crew", href: null, members, days: daysOf({ 0: ["me"], 1: ["me", "b"], 2: ["c", "d"] }), today, me: "me" });
  assert.deepEqual([s.streak, s.today, s.solvedToday], [2, false, 1]);
  assert.equal(groupLine(s), "1 of 4 solved today. 1 more keeps your 2 days going.");
  assert.equal(groupLine(s, false), "1 of 4 solved today. 1 more keeps the 2 days going.");
  const none = crewStreak({ name: "Crew", href: null, members, days: daysOf({ 0: ["me"] }), today, me: "me" });
  assert.equal(groupLine(none), "1 of 4 solved today. When 2 of you solve it on the same day, a streak starts.");
  assert.equal(groupLine(none, false), "1 of 4 solved today. When 2 of the crew solve it on the same day, a streak starts.");
});

test("you and the people you follow: a day needs you and at least one of them", () => {
  const follows = new Set(["f1", "f2", "f3"]);
  const days = daysOf({ 0: ["me", "f1", "f2"], 1: ["me", "f3"], 2: ["f1", "f2"], 3: ["me", "f1"] });
  const s = peopleStreak({ me: "me", follows, days, today });
  assert.equal(s.name, "People you follow");
  assert.equal(s.solvedToday, 2);
  assert.equal(s.size, 4);
  assert.deepEqual([s.streak, s.today], [2, true]); // day 2 had no "me"
  assert.equal(groupLine(s), "You and 2 people you follow solved it today: 2 days running.");
});

test("your people: the lines before today counts", () => {
  const follows = new Set(["f1"]);
  const waiting = peopleStreak({ me: "me", follows, days: daysOf({ 0: ["me"], 1: ["me", "f1"] }), today });
  assert.equal(groupLine(waiting), "Nobody you follow has solved it yet today. One of them keeps your 1 day going.");
  const youNot = peopleStreak({ me: "me", follows, days: daysOf({ 0: ["f1"], 1: ["me", "f1"] }), today });
  assert.equal(groupLine(youNot), "Solve it today to keep your 1 day going with the people you follow.");
  const fresh = peopleStreak({ me: "me", follows, days: daysOf({ 0: ["me"] }), today });
  assert.equal(groupLine(fresh), "Nobody you follow has solved it yet today. When one of them does, your streak together starts.");
  const one = peopleStreak({ me: "me", follows, days: daysOf({ 0: ["me", "f1"] }), today });
  assert.equal(groupLine(one), "You and 1 person you follow solved it today: 1 day running.");
});

test("the race: each place's points and players, most points first", () => {
  const totals = raceTotals([
    { player: "u:1", points: 10 }, { player: "u:2", points: 8 }, { player: "i:9", points: 10 }, { player: "i:8", points: 10 },
    { player: "g:x", points: 6 }, { player: "u:3", points: 0 }, { player: "zz", points: 99 },
  ]);
  assert.deepEqual(totals, [
    { place: "discord", points: 20, players: 2 },
    { place: "site", points: 18, players: 3 },
    { place: "guest", points: 6, players: 1 },
  ]);
  assert.ok(isRace(totals));
});

test("the race: ties go to more players; one place alone isn't a race", () => {
  const tie = raceTotals([{ player: "g:a", points: 5 }, { player: "g:b", points: 5 }, { player: "u:a", points: 10 }]);
  assert.deepEqual(tie.map((t) => t.place), ["guest", "site"]);
  const solo = raceTotals([{ player: "u:a", points: 10 }]);
  assert.equal(isRace(solo), false);
  assert.equal(isRace(null), false);
  assert.deepEqual(raceTotals([{ player: "u:a", points: -3 }]), [{ place: "site", points: 0, players: 1 }]);
});

console.log(`\n${passed} passed`);
