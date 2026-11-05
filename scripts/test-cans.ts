/**
 * Cans' rules (src/lib/cans/rules.ts): typing a time, when it lands in the captain's time zone, the lineup's order,
 * and usual hours across time zones. Run: npx tsx scripts/test-cans.ts
 */
import {
  parseTime, startFor, lineupOf, isFull, grouped, toUtcSlot, toLocalHour, storeHours, localPicks, localGrid, bestHours, nextLocal, isTimeZone, TZ_CHOICES, discordTime,
  type CanRow,
} from "../src/lib/cans/rules";

let pass = 0, fail = 0;
const eq = (got: unknown, want: unknown, label: string) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log(`FAIL ${label}: got ${g}, want ${w}`); }
};

// Typing a time
eq(parseTime("7pm"), { hour: 19, minute: 0 }, "7pm");
eq(parseTime("7:30 PM"), { hour: 19, minute: 30 }, "7:30 PM");
eq(parseTime("7.30pm"), { hour: 19, minute: 30 }, "7.30pm");
eq(parseTime("19:00"), { hour: 19, minute: 0 }, "24-hour");
eq(parseTime("1930"), { hour: 19, minute: 30 }, "four digits");
eq(parseTime("7"), { hour: 19, minute: 0 }, "a bare hour is an evening");
eq(parseTime("12"), { hour: 12, minute: 0 }, "12 is noon");
eq(parseTime("12am"), { hour: 0, minute: 0 }, "12am is midnight");
eq(parseTime("12pm"), { hour: 12, minute: 0 }, "12pm is noon");
eq(parseTime("9a"), { hour: 9, minute: 0 }, "9a");
eq(parseTime("noon"), { hour: 12, minute: 0 }, "noon");
eq(parseTime("midnight"), { hour: 0, minute: 0 }, "midnight");
eq(parseTime("0:15"), { hour: 0, minute: 15 }, "0:15");
eq([parseTime("25:00"), parseTime("7:75pm"), parseTime("13pm"), parseTime("tonight"), parseTime("")], [null, null, null, null, null], "nonsense refused");

// When it lands: Wednesday 2026-11-04 4:00 PM Pacific = 00:00 UTC Thursday
const now = new Date("2026-11-05T00:00:00Z");
const at = (r: Date | "past") => (r === "past" ? r : r.toISOString());
eq(at(startFor("today", { hour: 19, minute: 0 }, "America/Los_Angeles", now)), "2026-11-05T03:00:00.000Z", "today 7pm Pacific");
eq(at(startFor("today", { hour: 19, minute: 0 }, "America/New_York", now)), "2026-11-05T00:00:00.000Z", "today 7pm Eastern is now (not past)");
eq(at(startFor("today", { hour: 12, minute: 0 }, "America/Los_Angeles", now)), "past", "today at noon has gone");
eq(at(startFor("tomorrow", { hour: 19, minute: 0 }, "America/Los_Angeles", now)), "2026-11-06T03:00:00.000Z", "tomorrow");
eq(at(startFor("wed", { hour: 19, minute: 0 }, "America/Los_Angeles", now)), "2026-11-05T03:00:00.000Z", "Wednesday is today, still ahead");
eq(at(startFor("wed", { hour: 12, minute: 0 }, "America/Los_Angeles", now)), "2026-11-11T20:00:00.000Z", "Wednesday at noon has gone: next week");
eq(at(startFor("sat", { hour: 20, minute: 0 }, "Europe/London", now)), "2026-11-07T20:00:00.000Z", "Saturday in London (Thursday there now)");
eq(at(startFor("today", { hour: 8, minute: 0 }, "Asia/Tokyo", now)), "past", "Tokyo is past Thursday 8am already");
eq(at(startFor("today", { hour: 20, minute: 0 }, "Asia/Tokyo", now)), "2026-11-05T11:00:00.000Z", "Tokyo tonight");
// Across a daylight saving change: Sunday 2026-11-01 is the US change.
eq(at(startFor("sun", { hour: 19, minute: 0 }, "America/Los_Angeles", new Date("2026-10-30T12:00:00Z"))), "2026-11-02T03:00:00.000Z", "Sunday after the clocks go back (PST)");
eq(discordTime("2026-11-05T03:00:00Z", "R"), "<t:1793847600:R>", "Discord's timestamp");

// The lineup
const rows: CanRow[] = [
  { userId: "a", name: "Kevo", answer: "can", at: "2026-11-04T20:00:00Z" },
  { userId: "b", name: "Josh", answer: "can", at: "2026-11-04T20:01:00Z" },
  { userId: "c", name: "Amber", answer: "sub", at: "2026-11-04T20:00:30Z" },
  { userId: "d", name: "Munch", answer: "sub", at: "2026-11-04T20:05:00Z" },
  { userId: "e", name: "Pete", answer: "maybe", at: "2026-11-04T20:02:00Z" },
  { userId: "f", name: "Jo", answer: "cant", at: "2026-11-04T20:03:00Z" },
  { userId: "g", name: "Crazy", answer: "can", at: "2026-11-04T19:59:00Z" },
];
eq(grouped(rows).can.map((r) => r.name), ["Crazy", "Kevo", "Josh"], "cans in answer order");
eq(isFull(rows, 3), true, "three cans fill a 3v3");
eq(isFull(rows, 4), false, "but not a 4v4");
const l4 = lineupOf(rows, 4);
eq([l4.players.map((r) => r.name), l4.subs.map((r) => r.name)], [["Crazy", "Kevo", "Josh", "Amber"], ["Munch"]], "a sub fills the fourth spot, in answer order");
const l2 = lineupOf(rows, 2);
eq([l2.players.map((r) => r.name), l2.subs.map((r) => r.name)], [["Crazy", "Kevo"], ["Josh", "Amber", "Munch"]], "extra cans wait first, then subs");
eq(lineupOf([], 6).players.length, 0, "nobody answered");

// Time zones
eq(TZ_CHOICES.length <= 25, true, "the list fits a Discord menu");
eq(TZ_CHOICES.every((z) => isTimeZone(z.value)), true, "every listed zone is real");
eq([isTimeZone("Mars/Base"), isTimeZone(""), isTimeZone(42)], [false, false, false], "made-up zones refused");

// Usual hours: stored as UTC half-hours, shown in each viewer's zone
const ref = new Date("2026-11-04T20:00:00Z");
eq(toUtcSlot(1, 18, "America/Los_Angeles", ref), 100, "Tuesday 6 PM Pacific = Wednesday 02:00 UTC (half-hour 100)");
eq(toLocalHour(100, "America/Los_Angeles", ref), { day: 1, hour: 18 }, "and back");
eq(toLocalHour(100, "America/New_York", ref), { day: 1, hour: 21 }, "the same hour is Tuesday 9 PM Eastern");
eq(toLocalHour(100, "Europe/London", ref), { day: 2, hour: 2 }, "and Wednesday 2 AM in London");
eq(toUtcSlot(1, 18, "Asia/Kolkata", ref), 73, "Tuesday 6 PM in India = Tuesday 12:30 UTC (a half-hour slot)");
let roundTrip = true;
for (const tz of TZ_CHOICES.map((z) => z.value)) {
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) {
    const back = toLocalHour(toUtcSlot(d, h, tz, ref), tz, ref);
    if (back.day !== d || back.hour !== h) { roundTrip = false; console.log("round trip", tz, d, h, back); }
  }
}
eq(roundTrip, true, "every local hour goes to UTC and back in every listed zone");
const ana = storeHours([{ day: 1, hour: 18 }, { day: 1, hour: 19 }, { day: 1, hour: 18 }, { day: 9, hour: 1 }], "America/Los_Angeles", ref);
eq(ana, [100, 102], "picks stored once each, nonsense dropped");
eq(localPicks(ana, "America/Los_Angeles", ref), [{ day: 1, hour: 18 }, { day: 1, hour: 19 }], "your own picks back in your zone");
const ben = storeHours([{ day: 1, hour: 21 }], "America/New_York", ref);
const raj = storeHours([{ day: 2, hour: 7 }], "Asia/Kolkata", ref); // Wed 7 AM IST = Wed 01:30 UTC = Tue 5:30 PM Pacific
const grid = localGrid([ana, ben, raj], "America/Los_Angeles", ref);
eq([grid[1][18], grid[1][19], grid[1][17]], [2, 1, 1], "a Pacific captain sees Tuesday 6 PM with 2, and India's half-hour in the 5 PM hour");
eq(bestHours(grid, 2), [{ day: 1, hour: 18, count: 2 }, { day: 1, hour: 17, count: 1 }], "best hours first, ties earliest");
eq(nextLocal(1, 18, "America/Los_Angeles", ref).toISOString(), "2026-11-11T02:00:00.000Z", "Tuesday 6 PM Pacific has gone this week: next week's");
eq(nextLocal(3, 18, "America/Los_Angeles", ref).toISOString(), "2026-11-06T02:00:00.000Z", "Thursday 6 PM Pacific is this week");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
