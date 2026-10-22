/**
 * Lounge season analysis: formats, nights, tiers, partners, placements, pace, past seasons and the career.
 *   npx tsx scripts/test-lounge-season.ts
 */
import "./server-only-shim.cjs";
import {
  bestEvent, bestWinStreak, byFormat, byTier, byWeekday, careerTotals, contrast, formatOf, heroColors, lastEvents, lateInNight, nights, paceTo, partners, placements,
  seasonLabel, seasonList, seasonRecord, seasonSeries, sharedSeason, thinSeries, topShare, worstEvent, type CareerSeason,
} from "../src/lib/lounge/season";
import { toPlayer } from "../src/lib/mmr/mkcentral";
import { divisionLook } from "../src/lib/mmr/look";
import { formSquares, isEvent, tonightRun } from "../src/lib/mmr/rules";
import type { MmrChange } from "../src/lib/mmr/rules";
import { compareLine, last10Line, loungePagePath, tonightLine } from "../src/lib/lounge/lines";
import { nightRecap } from "../src/lib/lounge/recap";
import { aheadOdds, againstRoom, breakEven, eventDeltas, likelyPlaces, payouts } from "../src/lib/lounge/odds";
import { parseRoom, readRoom } from "../src/lib/lounge/room";
import { h2hLine, headToHead } from "../src/lib/lounge/h2h";
import { placeWord } from "../src/lib/mmr/rules";

let pass = 0, fail = 0;
const ok = (cond: unknown, label: string) => { if (cond) pass++; else { fail++; console.error("FAIL", label); } };
const eq = (a: unknown, b: unknown, label: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${label}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// Formats from teams and players
eq(formatOf({ teams: 12, players: 12 }), "FFA", "12 teams of 12 = FFA");
eq(formatOf({ teams: 6, players: 12 }), "2v2", "6 teams = 2v2");
eq(formatOf({ teams: 4, players: 12 }), "3v3", "4 teams = 3v3");
eq(formatOf({ teams: 3, players: 12 }), "4v4", "3 teams = 4v4");
eq(formatOf({ teams: 2, players: 12 }), "6v6", "2 teams = 6v6");
eq(formatOf({ teams: 24, players: 24 }), "FFA", "24P FFA");
eq(formatOf({ teams: 12, players: 24 }), "2v2", "24P 2v2");
eq(formatOf({ teams: 8, players: 24 }), "3v3", "24P 3v3");
eq(formatOf({ teams: null, players: null }), "FFA", "unknown = FFA");

// A made-up season: placement, two nights, a penalty
let id = 100;
const t0 = Date.parse("2026-10-13T02:00:00Z"); // Oct 12, 7pm Pacific
const ch = (mins: number, mmr: number, delta: number, extra: Partial<MmrChange> = {}): MmrChange => ({
  id: id++, mmr, delta, at: new Date(t0 + mins * 60_000).toISOString(), reason: "Table", place: null, score: null, tier: "B", teams: 12, players: 12, partners: [], partnerScores: [], ...extra,
});
const season: MmrChange[] = [
  { id: 1, mmr: 7600, delta: 0, at: new Date(t0 - 86_400_000).toISOString(), reason: "Placement", place: null, score: null, tier: null },
  ch(0, 7650, 50, { place: 2, score: 110 }),
  ch(25, 7610, -40, { place: 9, score: 70, tier: "A" }),
  ch(50, 7680, 70, { place: 1, score: 125, tier: "A" }),
  ch(75, 7660, -20, { teams: 6, players: 12, partners: [55], partnerScores: [90], score: 95, place: 3 }),
  ch(80, 7610, -50, { reason: "Penalty", tier: null }),
  // next night (well over 3 hours later)
  ch(60 * 24, 7700, 90, { teams: 6, players: 12, partners: [55], partnerScores: [100], score: 105, place: 1, tier: "SQ" }),
  ch(60 * 24 + 30, 7740, 40, { teams: 4, players: 12, partners: [77, 55], partnerScores: [80, 85], score: 99, place: 2, tier: "SQ" }),
  ch(60 * 24 + 60, 7780, 40, { place: 3, score: 100 }),
].reverse(); // the API's order: newest first

eq(seasonRecord(season), { events: 7, wins: 5, losses: 2, net: 230 }, "season record (events only)");
eq(bestWinStreak(season), 3, "best win streak");
eq(seasonSeries(season).length, 9, "series has every change");
eq(seasonSeries(season)[0].mmr, 7600, "series starts at placement");
eq(seasonSeries(season)[8].mmr, 7780, "series ends now");

const ns = nights(season);
eq(ns.length, 2, "two nights");
eq([ns[0].events, ns[0].wins, ns[0].losses, ns[0].net], [3, 3, 0, 170], "latest night first");
eq([ns[1].events, ns[1].wins, ns[1].losses, ns[1].net], [4, 2, 2, 10], "first night's net includes the penalty");
eq(ns[1].day, "2026-10-12", "night labelled by its Pacific day");
// Past midnight Pacific stays with the night before; 6am starts a new one.
const late = [ch(4 * 60 + 30, 7800, 20), ch(5 * 60 + 30, 7790, -10)].reverse(); // 11:30pm and 12:30am Pacific
eq(nights(late).length, 1, "a session past midnight is one night");
eq(nights(late)[0].day, "2026-10-12", "and it keeps the evening's day");
const morning = [ch(0, 7800, 20), ch(12 * 60, 7810, 10)].reverse(); // 7pm, then 7am next day
eq(nights(morning).length, 2, "the next morning is a new night");
eq(ns[0].mmr, 7780, "night ends on its last number");

const fm = byFormat(season);
eq(fm.map((f) => f.format), ["FFA", "2v2", "3v3"], "formats in order");
eq(fm.find((f) => f.format === "2v2"), { format: "2v2", events: 2, wins: 1, losses: 1, net: 70 }, "2v2 record");

const tr = byTier(season);
eq(tr.map((t) => t.tier), ["SQ", "A", "B"], "SQ first, then letters");
eq(tr.find((t) => t.tier === "A")?.averageScore, 97.5, "tier A average score");
const tiered = ["B", "S", "CD", "SQ", "AB", "A"].map((t, i) => ch(600 + i, 7000, 10, { tier: t }));
eq(byTier(tiered).map((t) => t.tier), ["SQ", "S", "A", "AB", "B", "CD"], "the lounge's tier order");

const pr = partners(season);
eq(pr[0].playerId, 55, "most frequent partner first");
eq([pr[0].events, pr[0].wins, pr[0].losses, pr[0].net], [3, 2, 1, 110], "partner record");
eq(pr[0].formats, ["2v2", "3v3"], "partner formats");
eq(pr[0].averageScore, 275 / 3, "partner average score");
eq(pr[1].playerId, 77, "second partner");

const pl = placements(season);
eq(pl.field, 12, "12-player field");
eq(pl.events, 4, "FFA events counted");
eq(pl.counts.slice(0, 3), [1, 1, 1], "1st, 2nd, 3rd");
eq(pl.counts[8], 1, "9th");

const pace = paceTo(220, season)!;
eq([pace.gain, pace.loss], [58, 30], "average gain and loss");
ok(Math.abs(pace.winRate - 5 / 7) < 1e-9, "win rate");
eq(pace.events, Math.ceil(220 / ((5 / 7) * 58 - (2 / 7) * 30)), "events to the next division");
eq(paceTo(null, season), null, "no next division = no pace");
eq(paceTo(100, season.slice(0, 3)), null, "too few events to say");
const losing = season.map((c) => (c.reason === "Table" ? { ...c, delta: c.delta > 0 ? 5 : -80 } : c));
eq(paceTo(100, losing)?.events, null, "a falling pace has no event count");

eq(bestEvent(season)?.delta, 90, "best event");

// Chat lines
eq(last10Line("Sam", season), "🏁 Sam's last 7: 5-2, +230. Best: 1st (2v2), +90. Average score 101.", "last 10 line");
eq(last10Line("Sam", []), "🏁 Sam has no events yet this season.", "last 10 with no events");
const steps = [{ name: "Gold", at: 6000 }, { name: "Platinum", at: 7700 }];
eq(tonightLine("Sam", season, new Date(t0 + 60 * 24 * 60_000 - 1).toISOString(), steps), "🏁 Sam tonight: 3 events, 3-0, +170. Into Platinum on event 1.", "tonight with a new division");
eq(tonightLine("Sam", season, new Date(t0 + 999 * 86_400_000).toISOString(), steps), "🏁 Sam hasn't played an event tonight yet.", "tonight before any event");
eq(compareLine({ name: "Sam", mmr: 8070, division: "Platinum", eventsPlayed: 93 }, { name: "Riley", mmr: 8412, division: "Platinum", eventsPlayed: 124 }), "🏁 Sam 8,070 (Platinum) vs Riley 8,412 (Platinum). Riley +342, played 31 more events.", "compare line");
eq(compareLine({ name: "A", mmr: 5000, division: "Silver", eventsPlayed: 10 }, { name: "B", mmr: 5000, division: "Silver", eventsPlayed: 12 }), "🏁 A 5,000 (Silver) vs B 5,000 (Silver). Level.", "compare level");
eq(loungePagePath("Hayai Kuruma", "mkworld12p"), "/lounge/Hayai%20Kuruma", "page path, default game");
eq(loungePagePath("Kevo", "mk8dx"), "/lounge/Kevo?game=mk8dx", "page path, other game");

// The night's recap (second night: 7610 → 7700 Platinum → 7740 → 7780, a new peak each time)
const recap = nightRecap({ changes: season, since: new Date(t0 + 60 * 24 * 60_000 - 1).toISOString(), steps, mmr: 7780, division: null });
eq([recap.events, recap.wins, recap.losses, recap.net], [3, 3, 0, 170], "recap record");
eq(recap.newDivisions, ["Platinum"], "recap new division");
eq(recap.squares, ["p", "p", "p"], "every gain tonight set a new peak");
eq(recap.best, { place: 1, delta: 90, format: "2v2" }, "recap best event");
eq(recap.division, "Platinum", "recap division now");
const first = nightRecap({ changes: season, since: new Date(t0 - 1).toISOString(), steps, mmr: 7780, division: null });
eq(first.squares.slice(0, 4), ["p", "l", "p", "l"], "7,680 beats the 7,650 peak, so it is a peak too");
const dip = nightRecap({ changes: [{ ...season[0], id: 999, mmr: 7700, delta: 20, at: new Date(t0 + 3 * 86_400_000).toISOString() }, ...season], since: new Date(t0 + 3 * 86_400_000 - 1).toISOString(), steps, mmr: 7700, division: null });
eq(dip.squares, ["w"], "a gain under the season peak is a plain win");
eq(nightRecap({ changes: season, since: new Date(t0 + 999 * 86_400_000).toISOString(), steps, mmr: 7780, division: null }).events, 0, "no events tonight");

// What a match pays (the mockup's room: Sam 8,070 among 7,210 to 8,412)
const room = [8412, 8288, 8070, 7990, 7880, 7810, 7742, 7660, 7590, 7500, 7350, 7210];
const pay = payouts(8070, room.filter((r) => r !== 8070));
eq(pay.length, 12, "a payout per place");
ok(Math.abs(pay[0] - 209) <= 2 && Math.abs(pay[11] + 231) <= 2, `1st about +209, 12th about −231 (got ${pay[0]}, ${pay[11]})`);
ok(pay.every((v, i) => i === 0 || Math.abs(pay[i - 1] - v - 40) <= 1), "each place worth 40 in free-for-all");
eq(breakEven(pay), 6, "6th breaks even");
eq(breakEven([-5, -10]), null, "a room where even 1st loses");
const lp = likelyPlaces(room);
ok(lp[0] < lp[2] && lp[2] < lp[11], "higher rating, better likely place");
ok(Math.abs(lp.reduce((a, b) => a + b, 0) - 78) < 1e-6, "likely places add up to 1+2+...+12");
ok(Math.abs(aheadOdds(8000, 8000) - 0.5) < 1e-9 && aheadOdds(9000, 8000) > 0.6, "odds");
ok(againstRoom(room, 0, 1) < 0, "winning as the favorite still beats the room");
// Event deltas: an even 2-team match pays the winner +K/2 per pair
eq(eventDeltas([{ rating: 8000, rank: 1 }, { rating: 8000, rank: 2 }], 6), [100, -100], "even 6v6: ±100");
eq(eventDeltas([{ rating: 8000, rank: 1 }, { rating: 8000, rank: 1 }]), [0, 0], "a tie pays nothing");

// Pasted rooms
eq(parseRoom("Room 3 · Tier A\nRiley, Lena, Sam, Kaizen\n5. Jo (7880)\n@Ana\n<@123> Theo"), [["Riley"], ["Lena"], ["Sam"], ["Kaizen"], ["Jo"], ["Ana"], ["Theo"]], "free-for-all paste");
eq(parseRoom("Hayai Kuruma\nhayai kuruma\nLiquor Store"), [["Hayai Kuruma"], ["Liquor Store"]], "names with spaces, duplicates dropped");
eq(parseRoom("Team 1: Riley, Sam\nTeam 2: Jo, Ana", 2), [["Riley", "Sam"], ["Jo", "Ana"]], "teams, one per line");
eq(parseRoom(Array.from({ length: 30 }, (_, i) => `P${i}`).join("\n")).length, 24, "at most 24 names");
const players = room.map((m, i) => [{ name: i === 2 ? "Sam" : `P${i}`, mmr: m, division: null, found: true }]);
const read = readRoom(players, "sam");
eq([read.me?.seed, read.me?.breakEven, read.favorite], [3, 6, 0], "Sam seeded 3rd, breaks even at 6th, the top seed favored");
ok(read.me && Math.abs(read.me.likely - 6) < 0.5, "Sam likely about 6th");
eq(read.average, 7792, "room average");
const withMissing = readRoom([...players.slice(0, 11), [{ name: "Ghost", mmr: null, division: null, found: false }]], "Sam");
eq(withMissing.missing, ["Ghost"], "names not found are listed");
eq(withMissing.me?.pay.length, 11, "pays only over the players found");
eq(readRoom(players, "Nobody").me, null, "no read when the name isn't in the room");

// Head-to-head: Sam (id 1) and Riley (id 2) share three events
const ev = (id: number, at: string, place: number, delta: number, extra: Partial<MmrChange> = {}): MmrChange => ({ id, mmr: 8000, delta, at, reason: "Table", place, score: 90, tier: "A", teams: 12, players: 12, partners: [], partnerScores: [], ...extra });
const sam = [ev(30, "2026-10-18T03:00:00Z", 5, -20), ev(20, "2026-10-16T03:00:00Z", 1, 60, { teams: 6, partners: [2] }), ev(10, "2026-10-15T03:00:00Z", 1, 50), ev(5, "2026-10-14T03:00:00Z", 2, 30)];
const riley = [ev(30, "2026-10-18T03:00:00Z", 2, 40), ev(20, "2026-10-16T03:00:00Z", 1, 60, { teams: 6, partners: [1] }), ev(10, "2026-10-15T03:00:00Z", 4, -10), ev(7, "2026-10-14T05:00:00Z", 3, 5)];
const hh = headToHead({ id: 1, changes: sam }, { id: 2, changes: riley });
eq(hh.events, 3, "three shared events");
eq([hh.opponents.events, hh.opponents.aAhead, hh.opponents.bAhead], [2, 1, 1], "opponents 1-1");
eq([hh.teammates.events, hh.teammates.wins, hh.teammates.net], [1, 1, 60], "teammates once, a win");
eq([hh.aFfaPlace, hh.bFfaPlace], [3, 3], "average FFA place in shared events");
eq(hh.meetings.map((m) => m.tableId), [30, 20, 10], "meetings newest first");
eq(h2hLine("Sam", "Riley", hh, placeWord), "🏁 Sam vs Riley: 3 events together. As opponents level 1-1. Teammates 1-0. Last: Oct 17, Riley 2nd, Sam 5th.", "h2h chat line");
eq(h2hLine("Sam", "Nova", headToHead({ id: 1, changes: sam }, { id: 3, changes: [] }), placeWord), "🏁 Sam and Nova haven't played an event together this season.", "no shared events");

// Late in a night (first night: 4 events, second: 3)
const split = lateInNight(season, 2);
eq([split.early.events, split.early.net], [4, 10 + 130], "first two events of each night");
eq([split.late?.events, split.late?.net], [3, 50 + 40], "the rest");
eq(lateInNight(season).late, null, "no late events when nights are short");

// ── Past seasons and the career (lounge page picks round 3) ──
eq(seasonList("mkworld12p", 3), [3, 2, 1], "MK World seasons 3 to 1, newest first");
eq(seasonList("mk8dx", 16).slice(-2), [5, 4], "MK8DX starts at season 4");
eq(seasonList("mk8dx", 16).length, 13, "MK8DX seasons 4 to 16");
eq(seasonList("mkworld24p", null), [], "no current season, no picker");
eq([seasonLabel(3, 3), seasonLabel(2, 3)], ["Season 3 (now)", "Season 2"], "season labels");
ok(sharedSeason("mkworld24p", 1) && sharedSeason("mkworld12p", 1) && !sharedSeason("mkworld12p", 2) && !sharedSeason("mk8dx", 1), "MK World season 1 is shared by 12 and 24 players");

eq(worstEvent(season)?.delta, -40, "worst event (penalties aren't events)");
eq(worstEvent([]), null, "no worst event without events");
eq(lastEvents(season, 3).map((c) => c.delta), [40, 40, 90], "last events newest first");
eq(lastEvents(season).length, 7, "last ten stops at the events there are");

eq(topShare(3, 5984), "top 0.1%", "top share under 1% keeps a decimal, rounded up");
eq(topShare(48, 12000), "top 0.4%", "48th of 12,000");
eq(topShare(250, 6000), "top 5%", "rounded up to a whole percent");
eq(topShare(6464, 6438), null, "a rank past the player count (no events) says nothing");
eq(topShare(null, 6000), null, "no rank, no share");

const long = Array.from({ length: 500 }, (_, i) => 10000 + Math.round(Math.sin(i / 9) * 300) + i * 4 + (i === 250 ? 900 : 0));
const thin = thinSeries(long, 90);
ok(thin.length <= 90, `thinned to 90 points or fewer (got ${thin.length})`);
eq([thin[0], thin[thin.length - 1]], [long[0], long[long.length - 1]], "thinning keeps the first and last numbers");
ok(thin.includes(Math.max(...long)), "thinning keeps the peak");
eq(thinSeries([1, 2, 3]), [1, 2, 3], "a short series stays as it is");

const row = (season: number, extra: Partial<CareerSeason>): CareerSeason => ({ season, current: false, shared: false, played: true, mmr: 10000, maxMmr: 10500, division: "Ruby", events: 10, winRate: 0.5, worldRank: 100, series: [9000, 10000], steps: [], ...extra });
const totals = careerTotals([row(1, { events: 100, winRate: 0.6, maxMmr: 13360, worldRank: 28 }), row(2, { played: false, events: 0, winRate: null, maxMmr: null, worldRank: null }), row(3, { events: 50, winRate: 0.3, maxMmr: 15792, worldRank: 3, current: true })]);
eq([totals.seasons, totals.peak, totals.events, totals.bestRank], [2, 15792, 150, 3], "career totals skip a season not played");
ok(Math.abs((totals.winRate ?? 0) - 0.5) < 1e-9, "career win rate is weighted by events");
eq(careerTotals([]), { seasons: 0, peak: null, events: 0, winRate: null, bestRank: null }, "an empty career");

// Weekdays count each event on its night's day (an event at 1am belongs to the evening before).
const utcDay = (ms: number) => new Date(ms).getUTCDay();
const wk = byWeekday([{ at: "2026-10-17T02:00:00Z", delta: 30 }, { at: "2026-10-17T05:30:00Z", delta: -10 }, { at: "2026-10-17T07:00:00Z", delta: 20 }], utcDay);
eq(wk.map((r) => [r.day, r.events]), [[5, 2], [6, 1]], "before 6am counts toward the day before");
eq(wk[0].average, 10, "average change per weekday");

// The header's colors: every division's label and white text pass AA on the band's text ground.
for (const name of ["Placement", "Iron", "Bronze", "Silver", "Gold", "Platinum", "Sapphire", "Ruby", "Diamond", "Master", "Grandmaster", "Diamond 2"]) {
  const d = divisionLook(name);
  const c = heroColors(d.c, d.c2);
  ok(contrast("#ffffff", c.mid) >= 4.5, `${name}: white on the band (${contrast("#ffffff", c.mid).toFixed(2)})`);
  ok(contrast(c.label, c.mid) >= 4.5, `${name}: the division label on the band (${contrast(c.label, c.mid).toFixed(2)})`);
  ok(contrast(c.label, c.deep) >= 4.5, `${name}: the label on the deepest ground`);
}

// MKCentral's details: the placement start stays (id 0, not an event), a deleted table stops counting.
const raw = {
  playerId: 7, name: "Sam", season: 2, mmr: 9100, maxMmr: 9200, rank: "Sapphire", eventsPlayed: 2, winsLastTen: 1, lossesLastTen: 1, averageLastTen: 99.5, partnerAverage: 80.25, countryName: "Canada",
  mmrChanges: [
    { changeId: 300, newMmr: 9100, mmrDelta: -100, reason: "TableDelete", time: "2026-02-03T05:00:00Z", tier: "B" },
    { changeId: 300, newMmr: 9200, mmrDelta: 100, reason: "Table", time: "2026-02-02T05:00:00Z", score: 120, rank: 1, tier: "B", numTeams: 12, numPlayers: 12 },
    { changeId: 200, newMmr: 9100, mmrDelta: 60, reason: "Table", time: "2026-02-02T04:00:00Z", score: 101, rank: 2, tier: "B", numTeams: 12, numPlayers: 12 },
    { changeId: 100, newMmr: 9040, mmrDelta: -60, reason: "Table", time: "2026-02-02T03:00:00Z", score: 70, rank: 10, tier: "B", numTeams: 12, numPlayers: 12 },
    { newMmr: 9100, mmrDelta: 0, reason: "Placement", time: "2026-02-01T04:00:00Z" },
  ],
};
const parsed = toPlayer(raw, "mkworld12p")!;
eq(parsed.changes.length, 5, "every row kept, the placement included");
eq(parsed.changes[parsed.changes.length - 1], { ...parsed.changes[parsed.changes.length - 1], id: 0, reason: "Placement", mmr: 9100 }, "the placement start keeps id 0");
eq(parsed.changes.filter(isEvent).map((c) => c.id), [200, 100], "a deleted table is not an event");
eq(parsed.changes.find((c) => c.id === 300 && c.reason !== "TableDelete")?.reason, "TableDeleted", "the deleted table is marked");
eq(seasonSeries(parsed.changes).map((p) => p.mmr), [9100, 9040, 9100, 9200, 9100], "the chart starts at the placement and follows every change");
eq(seasonRecord(parsed.changes), { events: 2, wins: 1, losses: 1, net: 0 }, "the season record counts the two real events");
eq(formSquares(parsed.changes), ["l", "w"], "the placement is never a square");
eq(tonightRun(parsed.changes, "2026-02-01T00:00:00Z").events, 2, "the placement isn't an event tonight either");
eq(nights(parsed.changes).length, 1, "and isn't a night");
eq([parsed.winsLastTen, parsed.lossesLastTen, parsed.averageLastTen, parsed.partnerAverage, parsed.countryName, parsed.largestLoss], [1, 1, 99.5, 80.25, "Canada", null], "last ten, partner average and country kept; a missing biggest loss is null");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
