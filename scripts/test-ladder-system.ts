/**
 * The lounge system's rules: npx tsx scripts/test-ladder-system.ts
 * Modes, the queue (tiers, rooms, rush hour, the vote, teams by MMR, host, subs), discipline (strikes, breaks,
 * reduced loss, soft resets), clean tables verifying themselves, MKCentral matching, instant verification and names.
 */

import { MODES, MODE_LIST, modeOf, modeSettings } from "../src/lib/ladders/modes";
import { drawTeams, joinCheck, nextRush, nextSub, openRoom, pickHost, rushRooms, teamAverage, voteWinner, type QueueChannel, type QueueEntry } from "../src/lib/ladders/queue";
import { activeStrikes, applyReducedLoss, breakAfter, cleanDiscipline, DEFAULT_DISCIPLINE, softReset, teammateLossMultiplier } from "../src/lib/ladders/discipline";
import { autoVerifyCheck, autoVerifyAt, compareRooms, withReadNumbers } from "../src/lib/ladders/autoVerify";
import { matchStart, mmrAtShare, seasonToUse, type MkcRecord } from "../src/lib/ladders/mkcMatch";
import { nameRequestCheck, verificationCheck } from "../src/lib/ladders/playerChecks";
import { divisionFor, parseKnockout, parseRace, placedFor, roomChanges, roomIssues, SETTLE_TABLES } from "../src/lib/ladders/rules";

let pass = 0, fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++; else { fail++; console.log(`FAIL ${label}\n  got  ${g}\n  want ${w}`); }
}
const ok = (label: string, v: boolean) => eq(label, v, true);

// ── Modes ──
{
  eq("modes", MODE_LIST.length, 5);
  const s200 = modeSettings("mk8dx200");
  eq("200cc mode", [s200.rules, s200.divisions[s200.divisions.length - 1].name, s200.placementEvents], ["lounge200", "Grandmaster", 1]);
  const s150 = modeSettings("mk8dx150");
  eq("150cc mode uses MKCentral's divisions", [s150.rules, s150.divisions.length, MODES.mk8dx150.sameScaleAsMkc], ["lounge", 18, true]);
  eq("knockout pay", modeSettings("knockout").pay?.k, 20);
  eq("mode of an old ladder", [modeOf({ game: "mk8dx", kind: "race", settings: { rules: "lounge200" } }), modeOf({ game: "mkworld", kind: "knockout", settings: { rules: "lounge" } })], ["mk8dx200", "knockout"]);
}

// ── The queue ──
const ch = (o: Partial<QueueChannel> = {}): QueueChannel => ({ id: "c", name: "Tier A", mode: "open", size: 12, minMmr: 7000, maxMmr: null, formats: [1, 2, 3, 4, 6], voteSeconds: 45, rushTimes: [], closeMinutes: 5, lowest: false, ...o });
const entry = (i: number, mmr: number, o: Partial<QueueEntry> = {}): QueueEntry => ({ key: `p${i}`, name: `P${i}`, mmr, placing: false, canHost: false, joinedAt: new Date(Date.UTC(2026, 10, 1, 20, 0, i)).toISOString(), ...o });
{
  eq("join: in range", joinCheck(ch(), { mmr: 8000, placing: false }, false), null);
  eq("join: below", joinCheck(ch(), { mmr: 6000, placing: false }, false), "below_tier");
  eq("join: above", joinCheck(ch({ minMmr: null, maxMmr: 8000 }), { mmr: 9000, placing: false }, false), "above_tier");
  eq("join: placement only in the lowest tier", [joinCheck(ch(), { mmr: 2000, placing: true }, false), joinCheck(ch({ lowest: true, minMmr: null }), { mmr: 2000, placing: true }, false)], ["placement_lowest", null]);
  eq("join: twice / on a break", [joinCheck(ch(), { mmr: 8000, placing: false }, true), joinCheck(ch(), { mmr: 8000, placing: false, onBreak: true }, false)], ["already_in", "on_break"]);
  const twelve = Array.from({ length: 13 }, (_, i) => entry(i, 9000 - i * 100));
  eq("open room: not yet", openRoom(twelve.slice(0, 11), 12), null);
  const r = openRoom([...twelve].reverse(), 12)!;
  eq("open room: first 12 in", [r.room.length, r.rest.map((e) => e.key)], [12, ["p12"]]);
  const rush = rushRooms(Array.from({ length: 31 }, (_, i) => entry(i, 5000 + ((i * 37) % 31) * 100)), 12);
  eq("rush: 2 rooms, 7 wait", [rush.rooms.length, rush.waiting.length], [2, 7]);
  ok("rush: sorted by MMR", rush.rooms[0][11].mmr >= rush.rooms[1][0].mmr && rush.rooms[1][11].mmr >= rush.waiting[0].mmr);
  // Rush hour at 20:00 Pacific; on Nov 1 2026 (after the DST change, PST) that's 04:00 UTC the next day.
  const nr = nextRush(["20:00"], 5, new Date("2026-11-02T01:00:00Z"))!;
  eq("next rush (PST)", [nr.at.toISOString(), nr.closesAt.toISOString()], ["2026-11-02T04:00:00.000Z", "2026-11-02T03:55:00.000Z"]);
  const summer = nextRush(["20:00", "12:00"], 5, new Date("2026-07-01T20:00:00Z"))!;
  eq("next rush (PDT, the later of two)", summer.at.toISOString(), "2026-07-02T03:00:00.000Z");
  eq("next rush: none set", nextRush([], 5, new Date()), null);
  eq("vote: most", voteWinner([2, 2, 3, 1, 2], [1, 2, 3, 4, 6]), 2);
  eq("vote: tie goes bigger", voteWinner([2, 3, 2, 3], [1, 2, 3, 4, 6]), 3);
  eq("vote: none = biggest allowed", voteWinner([], [1, 2]), 2);
  eq("vote: not allowed ignored", voteWinner([6, 6, 1], [1, 2]), 1);
  const players = Array.from({ length: 12 }, (_, i) => ({ key: `k${i}`, mmr: 12000 - i * 500 }));
  const t2 = drawTeams(players, 2);
  eq("teams 2v2: six of two", t2.map((t) => t.length), [2, 2, 2, 2, 2, 2]);
  eq("teams 2v2: snake (best with worst)", t2[0].map((p) => p.key), ["k0", "k11"]);
  const avgs = t2.map(teamAverage);
  ok("teams 2v2: even averages", Math.max(...avgs) - Math.min(...avgs) === 0);
  const t6 = drawTeams(players, 6);
  const sp6 = Math.abs(teamAverage(t6[0]) - teamAverage(t6[1]));
  ok(`teams 6v6: close (${sp6})`, sp6 <= 500);
  eq("teams FFA", drawTeams(players, 1).length, 12);
  const room = [entry(1, 9000), entry(2, 9500, { canHost: true }), entry(3, 9900)];
  eq("host: highest who can host", pickHost(room)?.key, "p2");
  eq("host: else highest", pickHost(room.map((p) => ({ ...p, canHost: false })))?.key, "p3");
  const subs = [entry(5, 6500), entry(6, 7200), entry(7, 7600)];
  eq("sub: first in range", nextSub(subs, ch(), new Set())?.key, "p6");
  eq("sub: skip asked", nextSub(subs, ch(), new Set(["p6"]))?.key, "p7");
}

// ── Discipline ──
{
  const now = new Date("2026-11-01T20:00:00Z");
  const strikes = [{ at: "2026-10-30T20:00:00Z", count: 1 }, { at: "2026-09-01T20:00:00Z", count: 2 }, { at: "2026-10-31T20:00:00Z", count: 1, undone: true }];
  eq("active strikes (30 days, undone left out)", activeStrikes(strikes, DEFAULT_DISCIPLINE, now), 1);
  eq("a break at 3", breakAfter(strikes, 2, DEFAULT_DISCIPLINE, now)?.toISOString(), "2026-11-08T20:00:00.000Z");
  eq("no break below 3", breakAfter(strikes, 1, DEFAULT_DISCIPLINE, now), null);
  eq("MKCentral's reduced loss", [2, 3, 4, 5, 6, 7, 8, 12].map((m) => teammateLossMultiplier(m, DEFAULT_DISCIPLINE.reducedLoss)), [1, 0.833, 0.667, 0.5, 0.333, 0.167, 0, 0]);
  const changes = [
    { key: "vex", team: 0, before: 5000, delta: -80, after: 4920 }, { key: "dot", team: 0, before: 5200, delta: -80, after: 5120 },
    { key: "juno", team: 1, before: 6000, delta: 60, after: 6060 }, { key: "kit", team: 1, before: 6100, delta: 60, after: 6160 },
  ];
  const red = applyReducedLoss(changes, [{ key: "vex", races: 5 }], DEFAULT_DISCIPLINE.reducedLoss);
  eq("reduced loss: the teammate loses half, the dropper full, winners untouched", red.map((c) => [c.key, c.delta, c.multiplier]), [["vex", -80, null], ["dot", -40, 0.5], ["juno", 60, null], ["kit", 60, null]]);
  eq("reduced loss off", applyReducedLoss(changes, [{ key: "vex", races: 9 }], null).map((c) => c.delta), [-80, -80, 60, 60]);
  eq("soft reset (the picks page's example)", softReset(12418, 5000), 8709);
  eq("soft reset floor", softReset(10, 5000, 0), 5000);
  const cd = cleanDiscipline({ penalties: { late: { mmr: 75, strikes: 9 } }, breakAt: 4, reducedLoss: null });
  eq("clean discipline", [cd.penalties.late.mmr, cd.penalties.late.strikes, cd.penalties.drop_before.mmr, cd.breakAt, cd.reducedLoss], [75, 5, 200, 4, null]);
}

// ── Clean tables verify themselves ──
{
  const typedText = ["A", "Juno 130", "Lux 70", "B", "Kit 118", "Rook 66", "C", "Sable 104", "Pip 60", "D", "Mara 96", "Dot 52", "E", "Vex 90", "Wren 42", "F", "Ash 84", "Bo 72"].join("\n");
  const typed = parseRace(typedText, 2);
  const known = new Set(typed.teams.flatMap((t) => t.players.map((p) => p.key)));
  const read = parseRace(typedText, 2);
  const clean = autoVerifyCheck({ typed, read, issues: roomIssues(typed, known), openRequests: 0, missedRaces: 0 });
  eq("clean table", [clean.clean, clean.reasons], [true, []]);
  const off = parseRace(typedText.replace("Sable 104", "Sable 110").replace("Kit 118", "Kitt 118"), 2);
  const diffs = compareRooms(typed, off);
  eq("diffs: a score and a name", diffs.map((d) => d.kind).sort(), ["name", "score"]);
  const check = autoVerifyCheck({ typed, read: off, issues: [], openRequests: 1, missedRaces: 1 });
  eq("not clean, with reasons", [check.clean, check.reasons.length], [false, 4]);
  ok("reason wording", check.reasons.includes("The text says Sable 104, the screenshot says 110"));
  eq("no screenshot", autoVerifyCheck({ typed, read: null, issues: [], openRequests: 0, missedRaces: 0 }).reasons, ["No screenshot was read"]);
  const fixed = withReadNumbers(typedText, typed, off);
  ok("use the screenshot's numbers", fixed.includes("Sable 110") && fixed.includes("Kitt 118") && fixed.startsWith("A\n"));
  eq("hold", autoVerifyAt("2026-11-01T20:00:00.000Z"), "2026-11-01T20:10:00.000Z");
  const ko = parseKnockout("Vex\nJuno\nAsh");
  const koRead = parseKnockout("Juno\nVex\nAsh");
  eq("knockout places", compareRooms(ko, koRead).map((d) => d.kind), ["place", "place"]);
}

// ── MKCentral matching ──
{
  const rec = (o: Partial<MkcRecord> = {}): MkcRecord => ({ name: "Juno", division: "Platinum 1", current: { season: 4, mmr: 8412, events: 46, rank: 1402, total: 7810 }, previous: { season: 3, mmr: 7900, events: 80, rank: 2000, total: 7000 }, ...o });
  eq("season: this one with 10 events", seasonToUse(rec())?.season, 4);
  eq("season: else last", seasonToUse(rec({ current: { season: 4, mmr: 8000, events: 3, rank: 900, total: 7810 } }))?.season, 3);
  const same = matchStart(rec(), { sameScale: true, ladderMmrs: [], ladderName: "150cc Ladder", mkcLabel: "MKCentral's 150cc lounge" });
  eq("same scale", [same.how, same.how === "same_scale" ? same.start : 0], ["same_scale", 8412]);
  ok("same scale line", same.line.includes("You start at 8,412") && same.line.includes("Platinum 1"));
  const ladder = Array.from({ length: 100 }, (_, i) => 12000 - i * 100);
  const share = matchStart(rec(), { sameScale: false, ladderMmrs: ladder, ladderName: "200cc Lounge", mkcLabel: "MKCentral's 150cc lounge" });
  eq("share", [share.how, share.how === "share" ? share.start : 0], ["share", 10300]);
  ok("share line", share.line.includes("top 18%"));
  eq("share: too few rated", matchStart(rec(), { sameScale: false, ladderMmrs: ladder.slice(0, 20), ladderName: "x", mkcLabel: "y" }).how, "none");
  eq("no record", matchStart(null, { sameScale: true, ladderMmrs: [], ladderName: "x", mkcLabel: "y" }).how, "none");
  eq("mmr at share", [mmrAtShare(ladder, 0.01), mmrAtShare(ladder, 1)], [12000, 2100]);
}

// ── Instant verification and names ──
{
  const p = { id: 1, name: "Juno", banned: false, switchCodes: 1, country: "us" };
  eq("verify: clean", verificationCheck({ profiles: [p], discordOnLadder: false, mkcIdOnLadder: false }), { ok: true });
  eq("verify: no MKCentral", verificationCheck({ profiles: [], discordOnLadder: false, mkcIdOnLadder: false }).ok, false);
  const banned = verificationCheck({ profiles: [{ ...p, banned: true }], discordOnLadder: false, mkcIdOnLadder: false });
  eq("verify: banned to the player", banned.ok ? null : [banned.to, banned.reason], ["player", "banned"]);
  const taken = verificationCheck({ profiles: [p], discordOnLadder: true, mkcIdOnLadder: false });
  eq("verify: conflicts to staff", taken.ok ? null : taken.to, "staff");
  const now = new Date("2026-11-01T20:00:00Z");
  eq("name: clean", nameRequestCheck({ name: "Kestrel", current: "Juno", lastChangeAt: null, others: ["Rook", "Moss"], filterOk: true, now }), { ok: true });
  const wait = nameRequestCheck({ name: "Kestrel", current: "Juno", lastChangeAt: "2026-10-01T20:00:00Z", others: [], filterOk: true, now });
  eq("name: 60 days", wait.ok ? null : wait.reason, "wait");
  const close = nameRequestCheck({ name: "Mosss", current: "Juno", lastChangeAt: null, others: ["Moss"], filterOk: true, now });
  eq("name: one letter off goes to staff", close.ok ? null : [close.to, close.reason], ["staff", "close"]);
  const tk = nameRequestCheck({ name: "moss", current: "Juno", lastChangeAt: null, others: ["Moss"], filterOk: true, now });
  eq("name: taken", tk.ok ? null : tk.reason, "taken");
  const filt = nameRequestCheck({ name: "Kestrel", current: "Juno", lastChangeAt: null, others: [], filterOk: false, now });
  eq("name: filter to staff", filt.ok ? null : filt.to, "staff");
}

// ── Rush hour times across daylight saving changes ─────────────────────────────────────────────────────────────
{
  // Nov 1, 2026: clocks go back at 2am. 8pm that evening is PST (04:00 UTC the next day).
  eq("rush: 8pm on the day clocks go back", nextRush(["20:00"], 5, new Date("2026-11-01T18:00:00Z"))?.at.toISOString(), "2026-11-02T04:00:00.000Z");
  eq("rush: 3:40pm on the day clocks go back", nextRush(["15:40"], 0, new Date("2026-11-01T23:30:00Z"))?.at.toISOString(), "2026-11-01T23:40:00.000Z");
  // Mar 8, 2026: clocks go forward at 2am. 8pm that evening is PDT (03:00 UTC the next day).
  eq("rush: 8pm on the day clocks go forward", nextRush(["20:00"], 5, new Date("2026-03-08T18:00:00Z"))?.at.toISOString(), "2026-03-09T03:00:00.000Z");
}

// ── Settling starts (a soft reset or an MKCentral match): placed straight away, first 2 tables double ─────────────
{
  const s150 = modeSettings("mk8dx150");
  const names = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
  const room = parseRace(names.map((n, i) => `${n} ${[110, 108, 100, 95, 90, 85, 80, 77, 70, 61, 58, 50][i]}`).join("\n"), 1);
  const plain = new Map(names.map((n) => [n.toLowerCase(), { mmr: 5000, events: 20 }]));
  const settle0 = new Map(names.map((n) => [n.toLowerCase(), { mmr: 5000, events: 0, settle: true }]));
  const settle2 = new Map(names.map((n) => [n.toLowerCase(), { mmr: 5000, events: SETTLE_TABLES, settle: true }]));
  const a = roomChanges(room, plain, s150), b = roomChanges(room, settle0, s150), c = roomChanges(room, settle2, s150);
  eq("settling: first tables move double", b[0].delta, a[0].delta * 2);
  ok("settling: not placement", b.every((x) => !x.placement && x.settling));
  eq("settled after 2 tables: normal moves", c[0].delta, a[0].delta);
  ok("settled: no settling mark", c.every((x) => !x.settling));
  ok("settling: division shows straight away", divisionFor(5000, placedFor({ mmr: 5000, events: 0, settle: true }, s150), s150).division !== "Placement");
  const s200 = modeSettings("mk8dx200");
  const fresh200 = roomChanges(room, new Map(), s200, { tier: "A" });
  const settle200 = roomChanges(room, new Map(names.map((n) => [n.toLowerCase(), { mmr: 5000, events: 0, settle: true }])), s200, { tier: "A" });
  const plain200 = roomChanges(room, new Map(names.map((n) => [n.toLowerCase(), { mmr: 5000, events: 9 }])), s200, { tier: "A" });
  ok("200 rules: a fresh player is placed by score", fresh200.every((x) => x.placement));
  ok("200 rules: a settling player keeps their number", settle200.every((x) => x.before === 5000 && !x.placement));
  eq("200 rules: settling moves double", settle200[0].delta, plain200[0].delta * 2);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
