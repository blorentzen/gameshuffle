/**
 * Time trial tournaments: the pure rules (src/lib/tournaments/tt/rules.ts).
 * npx tsx scripts/test-tt-events.ts
 */
import {
  bestTimes, clipNeeded, cutRound, inWindow, matchResult, pointsForPlace, rankOn, shapeRounds, spreadGroups, suggestPlan,
  type TtRun,
} from "../src/lib/tournaments/tt/rules";
import {
  BRACKET_ROUND_BASE, bracketSlot, bracketTracks, bracketTtRound, isOpenMatch, isTtBracket, openMatchFor, settleBracket, ttBestOfOf,
  type TtBracketTime,
} from "../src/lib/tournaments/tt/bracketTt";
import { bracketChampion, generateDoubleElim, generateSingleElim } from "../src/lib/tournaments/bracket";
import { atStation, fillStations, isVenue, queuedGroups, ttSettingsOf } from "../src/lib/tournaments/tt/event";
import { matchClipRuleOf, matchHolds, matchProofStates, type MatchProofTime } from "../src/lib/tournaments/tt/matchProof";
import { reportsFromTimes, type TtSwissTime } from "../src/lib/tournaments/tt/swissTt";
import { newSwissState, pairNextRound, swissSettingsOf } from "../src/lib/tournaments/swiss";

let pass = 0, fail = 0;
const check = (ok: boolean, what: string, extra?: unknown) => {
  if (ok) pass++; else { fail++; console.log(`FAIL ${what}${extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`); }
};
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const run = (player: string, track: string, ms: number, counts = true): TtRun => ({ player, track, ms, counts });

// Points by place.
check(eq([1, 2, 3, 4, 12, 13, 40].map(pointsForPlace), [15, 12, 10, 9, 1, 1, 1]), "points by place: 15, 12, 10, then down to 1; below 12th still 1");
check(pointsForPlace(0) === 0, "no place, no points");

// Best times: the fastest counting run.
{
  const b = bestTimes([run("a", "t1", 100_000), run("a", "t1", 95_000), run("a", "t1", 90_000, false), run("b", "t1", 99_000)]);
  check(b.get("t1")!.get("a") === 95_000, "best time is the fastest counting run (rejected ones skipped)");
  check(b.get("t1")!.get("b") === 99_000, "other players kept");
}

// Ranking on total time.
{
  const tracks = ["t1", "t2"];
  const runs = [
    run("a", "t1", 90_000), run("a", "t2", 100_000), // 190.000
    run("b", "t1", 91_000), run("b", "t2", 98_000),  // 189.000
    run("c", "t1", 89_000),                          // one track
    run("d", "t1", 92_000), run("d", "t2", 99_000),  // 191.000
  ];
  const rows = rankOn(["a", "b", "c", "d", "e"], tracks, runs, "total");
  check(eq(rows.map((r) => r.player), ["b", "a", "d", "c", "e"]), "total: complete by total, then fewer tracks, then no time", rows.map((r) => r.player));
  check(rows[0].total === 189_000 && rows[3].total === null && !rows[3].complete, "totals only for complete players");
  check(rows[4].place === 5 && rows[4].done === 0, "no time comes last");
  check(rows[0].places.t2 === 1 && rows[3].places.t1 === 1, "per-track places among the group");
}

// Ties: the better best single-track place, then shared.
{
  const tracks = ["t1", "t2"];
  const runs = [run("a", "t1", 90_000), run("a", "t2", 100_000), run("b", "t1", 95_000), run("b", "t2", 95_000)]; // both 190.000
  const rows = rankOn(["a", "b"], tracks, runs, "total");
  // a is 1st on t1, b is 1st on t2: best place 1 each, so still level.
  check(rows[0].place === 1 && rows[1].place === 1 && rows.every((r) => r.tied), "level on total and best place: shared and tied", rows);
  const runs2 = [run("a", "t1", 90_000), run("a", "t2", 100_000), run("b", "t1", 95_000), run("b", "t2", 95_000), run("c", "t1", 89_000), run("c", "t2", 102_000)];
  const r2 = rankOn(["a", "b", "c"], tracks, runs2, "total");
  // a 190, b 190, c 191. On t1: c 1st, a 2nd, b 3rd. On t2: b 1st, a 2nd, c 3rd. a's best place 2, b's 1: b ahead.
  check(eq(r2.map((r) => [r.player, r.place]), [["b", 1], ["a", 2], ["c", 3]]), "a tie on total goes to the better best single-track place", r2.map((r) => [r.player, r.place]));
}

// Ranking on points.
{
  const tracks = ["t1", "t2", "t3"];
  const runs = [
    run("a", "t1", 90_000), run("a", "t2", 90_000),            // 15 + 15 = 30
    run("b", "t1", 91_000), run("b", "t2", 91_000), run("b", "t3", 91_000), // 12 + 12 + 15 = 39
  ];
  const rows = rankOn(["a", "b"], tracks, runs, "points");
  check(rows[0].player === "b" && rows[0].points === 39 && rows[1].points === 30, "points: each track's place points add up, a missing track scores nothing");
}

// Spreading groups by seed (snake).
{
  const seeds = Array.from({ length: 10 }, (_, i) => `s${i + 1}`);
  const g = spreadGroups(seeds, 4);
  check(g.length === 3, "10 players in groups of 4 make 3 groups");
  check(eq(g.map((x) => x.length).sort(), [3, 3, 4]), "group sizes differ by one at most", g.map((x) => x.length));
  check(eq(g.map((x) => x[0]), ["s1", "s2", "s3"]), "the top seeds lead different groups");
  check(eq(g[0], ["s1", "s6", "s7"]) && eq(g[2], ["s3", "s4", "s9", "s10"]), "seeds snake back and forth", g);
  for (const n of [2, 5, 7, 16, 31, 64, 100, 128]) for (const size of [2, 3, 4, 6, 8, 12]) {
    const gs = spreadGroups(Array.from({ length: n }, (_, i) => String(i)), size);
    const lens = gs.map((x) => x.length);
    if (Math.max(...lens) - Math.min(...lens) > 1 || lens.reduce((a, b) => a + b, 0) !== n || Math.max(...lens) > size) check(false, `spread ${n} by ${size}`, lens);
    else pass++;
  }
  check(spreadGroups(seeds, 50).length === 1 && spreadGroups(seeds, 1).length === 5, "group size is kept between 2 and 12");
}

// The cut: top N, a run-off across the line, fill-ins for empty spots.
{
  const tracks = ["t1"];
  const runs = [
    run("a1", "t1", 90_000), run("a2", "t1", 91_000), run("a3", "t1", 92_000), run("a4", "t1", 93_000),
    run("b1", "t1", 90_500), run("b2", "t1", 91_500), run("b3", "t1", 91_500), run("b4", "t1", 94_000),
    run("c1", "t1", 95_000), // c2, c3 set no time
  ];
  const groups = [["a1", "a2", "a3", "a4"], ["b1", "b2", "b3", "b4"], ["c1", "c2", "c3"]].map((p) => rankOn(p, tracks, runs, "total"));
  const cut = cutRound(groups, 2, tracks, runs, "total");
  check(eq(cut.runoffs, [{ group: 1, players: ["b2", "b3"], spots: 1 }]), "a tie across the line goes to a run-off for the spots left", cut.runoffs);
  check(cut.fillIns.length === 1 && cut.fillIns[0] === "a3", "an empty spot goes to the fastest just under the cut in the round", cut.fillIns);
  check(eq(cut.through.slice(0, 3), ["a1", "b1", "c1"]), "group winners first in the next round's seeding", cut.through);
  check(cut.through.includes("a2") && !cut.through.includes("b2") && cut.through.length === 5, "seconds next, the tied pair waits", cut.through);
}

// Round shapes and plans.
{
  const s = shapeRounds(32, [{ size: 4, advance: 2 }, { size: 4, advance: 2 }, { size: 8, advance: 0 }]);
  check(eq(s.map((r) => [r.players, r.groups, r.through, r.final]), [[32, 8, 16, false], [16, 4, 8, false], [8, 1, 1, true]]), "32 in fours, top 2, twice, then a final of 8", s);
  const big = shapeRounds(128, [{ size: 8, advance: 4 }, { size: 4, advance: 2 }, { size: 8, advance: 0 }]);
  check(eq(big.map((r) => r.groups), [16, 16, 4]), "128 in eights top 4, then fours top 2, leaves 32 for a third round", big.map((r) => r.groups));
  const odd = shapeRounds(30, [{ size: 4, advance: 2 }]);
  check(eq(odd[0].sizes, [4, 4, 4, 4, 4, 4, 3, 3]) && odd[0].through === 16, "30 players: groups of 4 and 3, 16 through", odd[0]);
  check(eq(suggestPlan(32, 4, 2), [{ size: 4, advance: 2 }, { size: 4, advance: 2 }, { size: 8, advance: 0 }]), "suggested plan for 32 in fours", suggestPlan(32, 4, 2));
  const ko = suggestPlan(16, 2, 1, 2);
  check(ko.length === 4 && ko[3].size === 2 && ko[3].advance === 0, "a 1v1 knockout for 16 is four rounds ending in a final of 2", ko);
  for (const n of [5, 9, 24, 37, 64, 100, 128, 200]) for (const [size, adv] of [[2, 1], [4, 2], [6, 3], [8, 4], [8, 2], [12, 6]]) {
    const plan = suggestPlan(n, size, adv);
    const shape = shapeRounds(n, plan);
    if (!shape.length || !shape[shape.length - 1].final) check(false, `plan for ${n} in ${size}s top ${adv} ends in a final`, shape);
    else pass++;
  }
}

// Matches.
{
  const tracks = ["t1", "t2", "t3"];
  const m1 = matchResult("a", "b", tracks, [run("a", "t1", 90_000), run("b", "t1", 91_000), run("a", "t2", 95_000), run("b", "t2", 96_000)], false);
  check(m1.done && m1.winner === "a" && m1.a === 2 && m1.perTrack[2] === null, "best of 3: two tracks wins it before the third", m1);
  const m2 = matchResult("a", "b", tracks, [run("a", "t1", 90_000), run("b", "t1", 91_000)], false);
  check(!m2.done && m2.winner === null, "still open while the round runs", m2);
  const m3 = matchResult("a", "b", tracks, [run("a", "t1", 90_000), run("b", "t1", 91_000), run("b", "t2", 91_000)], true);
  check(m3.done && m3.winner === "b" === false && m3.a === 1 && m3.b === 1 && m3.level, "closed: a missing time loses its track; 1 to 1 with an empty third is level", m3);
  const m4 = matchResult("a", "b", ["t1"], [run("a", "t1", 90_000), run("b", "t1", 90_000)], false);
  check(m4.done && m4.level && m4.perTrack[0] === "tie", "one track, same time: level", m4);
  const m5 = matchResult("a", "b", ["t1"], [run("b", "t1", 99_000)], true);
  check(m5.winner === "b", "closed with one time: that player wins");
}


// Brackets decided by time trial.
{
  check(isTtBracket({ format: "single_elim", settings: { timeTrial: true } }) && isTtBracket({ format: "double_elim", settings: { timeTrial: true, lobbySize: 2 } }), "elimination with timeTrial is a TT bracket");
  check(!isTtBracket({ format: "single_elim", settings: { timeTrial: true, lobbySize: 4 } }) && !isTtBracket({ format: "swiss", settings: { timeTrial: true } }) && !isTtBracket({ format: "single_elim", settings: {} }), "lobbies of more, Swiss, or no flag: not a TT bracket");
  check(ttBestOfOf({ ttBestOf: 3 }) === 3 && ttBestOfOf({}) === 1 && ttBestOfOf({ ttBestOf: 5 }) === 1, "best of 1 unless 3");

  const list = ["t1", "t2", "t3", "t4", "t5"];
  const se = generateSingleElim(["p1", "p2", "p3", "p4", "p5", "p6"]);
  const r0 = se.matches.filter((m) => m.round === 0);
  check(r0.filter(isOpenMatch).length === 2 && r0.filter((m) => m.winner).length === 2, "6 players: two byes advance, two first-round matches open");
  check(bracketSlot(se, { group: "wb", round: 0 }) === 1 && bracketSlot(se, { group: "wb", round: 2 }) === 3, "winners rounds take slots 1, 2, 3");
  check(eq(bracketTracks(list, 1, se, { group: "wb", round: 1 }), ["t2"]) && eq(bracketTracks(list, 3, se, { group: "wb", round: 1 }), ["t4", "t5", "t1"]), "each round takes the next tracks, wrapping");
  check(bracketTtRound({ group: "wb", round: 2 }) === BRACKET_ROUND_BASE + 2 && bracketTtRound({ group: "lb", round: 1 }) === BRACKET_ROUND_BASE + 101 && bracketTtRound({ group: "gf", round: 1 }) === BRACKET_ROUND_BASE + 201, "times rounds per group");

  const open = r0.filter(isOpenMatch);
  const t = (pid: string, m: { group: "wb" | "lb" | "gf"; round: number }, track: string, ms: number, counts = true): TtBracketTime =>
    ({ participantId: pid, round: bracketTtRound(m), track, ms, counts });
  // One time in: nothing settles.
  const s0 = settleBracket(se, list, 1, [t(open[0].a!, open[0], "t1", 90_000)]);
  check(s0.settled.length === 0 && s0.bracket === se, "one time in a best of 1: still open");
  // Both times in on the first match: the faster one moves on.
  const times1 = [t(open[0].a!, open[0], "t1", 91_000), t(open[0].b!, open[0], "t1", 90_000)];
  const s1 = settleBracket(se, list, 1, times1);
  check(eq(s1.settled, [open[0].id]) && s1.bracket.matches.find((m) => m.id === open[0].id)!.winner === open[0].b, "faster time wins the match", s1.settled);
  check(se.matches.find((m) => m.id === open[0].id)!.winner === null, "the bracket passed in isn't changed");
  const next = s1.bracket.matches.find((m) => m.round === 1 && (m.a === open[0].b || m.b === open[0].b))!;
  check(!!next, "the winner moves on");
  // A rejected time doesn't count.
  const s2 = settleBracket(se, list, 1, [t(open[0].a!, open[0], "t1", 89_000, false), t(open[0].b!, open[0], "t1", 90_000)]);
  check(s2.settled.length === 0, "a rejected time doesn't count (the other player's alone doesn't settle it)");
  // Closing: a missing time loses its track; none at all is level.
  const s3 = settleBracket(se, list, 1, [t(open[1].a!, open[1], "t1", 95_000)], open[1].id);
  check(s3.settled.includes(open[1].id) && s3.bracket.matches.find((m) => m.id === open[1].id)!.winner === open[1].a, "settled on the times so far: the only time wins");
  const s4 = settleBracket(se, list, 1, [], open[1].id);
  check(s4.settled.length === 0 && s4.level === open[1].id, "settled with no times: level, the organizer picks");
  // Times for another round don't count for this match.
  const s5 = settleBracket(se, list, 1, [t(open[1].a!, { group: "wb", round: 1 }, "t2", 80_000), t(open[1].b!, open[1], "t1", 90_000)]);
  check(s5.settled.length === 0, "a time from another round doesn't count");
  // A whole single elimination played out by times.
  let b = se;
  const all: TtBracketTime[] = [];
  for (let guard = 0; guard < 20 && !bracketChampion(b); guard++) {
    for (const m of b.matches.filter(isOpenMatch)) {
      const tr = bracketTracks(list, 1, b, m)[0];
      const fast = [m.a!, m.b!].sort()[0];
      all.push(t(m.a!, m, tr, m.a === fast ? 90_000 : 92_000), t(m.b!, m, tr, m.b === fast ? 90_000 : 92_000));
    }
    b = settleBracket(b, list, 1, all).bracket;
  }
  check(bracketChampion(b) === "p1", "single elimination played out by times: the fastest wins", bracketChampion(b));
  check(openMatchFor(b, "p1") === null, "no open match once it's over");

  // Double elimination, best of 3, played out by times: the reset happens when the losers side wins the first final.
  const de = generateDoubleElim(["p1", "p2", "p3", "p4"]);
  let d = de;
  const dt: TtBracketTime[] = [];
  const order = (m: { a: string | null; b: string | null; id: string }) => {
    // p4 loses first, then wins everything; otherwise lower number is faster.
    if (m.id.startsWith("lb") || m.id.startsWith("gf")) return m.a === "p4" ? m.a : m.b === "p4" ? m.b : [m.a!, m.b!].sort()[0];
    return [m.a!, m.b!].sort()[0];
  };
  for (let guard = 0; guard < 30 && !bracketChampion(d); guard++) {
    for (const m of d.matches.filter(isOpenMatch)) {
      const fast = order(m);
      for (const tr of bracketTracks(list, 3, d, m).slice(0, 2)) dt.push(t(m.a!, m, tr, m.a === fast ? 90_000 : 92_000), t(m.b!, m, tr, m.b === fast ? 90_000 : 92_000));
    }
    d = settleBracket(d, list, 3, dt).bracket;
  }
  check(bracketChampion(d) === "p4", "double elimination with a reset, best of 3: p4 wins from the losers side", bracketChampion(d));
  check(d.matches.some((m) => m.id === "gf-r1-m0"), "the grand final reset was played");
  check(bracketSlot(d, { group: "gf", round: 1 }) === d.rounds + (d.lbRounds ?? 0) + 2, "the reset takes the slot after the grand final");
}


// In person: calling groups to stations.
{
  const groups = [["a", "b"], ["c", "d"], ["e", "f"], ["g", "h"]];
  const at = "2026-11-10T19:00:00.000Z";
  const first = fillStations({ n: 1, groups, calls: [] }, 2, at);
  check(eq(first.map((c) => [c.group, c.station]), [[0, 1], [1, 2]]), "the first groups fill the stations in order");
  const r = { n: 1, groups, calls: first };
  check(eq(queuedGroups(r), [2, 3]) && atStation(r, 1)?.group === 0 && atStation(r, 3) === null, "the queue and who's at each station");
  check(fillStations(r, 2, at).length === 0, "nothing to fill while both stations are busy");
  const doneOne = { ...r, calls: r.calls.map((c) => (c.station === 2 ? { ...c, doneAt: at } : c)) };
  const next = fillStations(doneOne, 2, at);
  check(next.length === 1 && next[0].group === 2 && next[0].station === 2, "a station that's done takes the next group");
  check(fillStations({ n: 0, groups: [[]], calls: [] }, 3, at).length === 0, "a leaderboard calls no groups");
  check(fillStations({ n: 1, groups: [["a"]], calls: [] }, 4, at).length === 1, "more stations than groups: the rest stay free");
  check(isVenue({ locationType: "in_person" }) && !isVenue({ locationType: "online" }) && !isVenue(null), "in person comes from the tournament's location");
  check(ttSettingsOf({ stations: 99 }, "mk8dx").stations === 32 && ttSettingsOf({}, "mk8dx").stations === 2 && ttSettingsOf({ stations: 0 }, "mk8dx").stations === 1, "stations: 1 to 32, two by default");
}

// Match proof: who adds a clip in a time trial match, and a decided match waiting on its checks.
{
  check(matchClipRuleOf(1) === 1 && matchClipRuleOf("-1") === -1 && matchClipRuleOf(3) === 0 && matchClipRuleOf(undefined) === 0, "match clip rule: 0, 1 or -1 (anything else is screenshots only)");
  check(ttSettingsOf({}, "mk8dx").matchClips === 0 && ttSettingsOf({ matchClips: 1 }, "mk8dx").matchClips === 1, "matches ask for screenshots only unless the organizer picks clips");
  const pt = (id: string, pid: string, track: string, ms: number, proof: MatchProofTime["proof"] = "none", video: string | null = null): MatchProofTime =>
    ({ id, participantId: pid, round: 7, track, ms, proof, video });
  const ts = [pt("x1", "a", "t1", 90_000), pt("x2", "b", "t1", 91_000), pt("x3", "a", "t2", 95_000, "waiting", "https://youtu.be/x"), pt("x4", "b", "t2", 94_000, "checked")];
  check(matchHolds("a", "b", ["t1", "t2"], 7, ts, 0).length === 0, "screenshots only: nothing holds a match");
  const h1 = matchHolds("a", "b", ["t1", "t2"], 7, ts, 1);
  check(eq(h1.map((h) => [h.id, h.place, h.needsClip]), [["x1", 1, true]]), "the faster time on each track: a's t1 needs a clip; b's checked t2 doesn't hold", h1);
  const hAll = matchHolds("a", "b", ["t1", "t2"], 7, ts, -1);
  check(eq(hAll.map((h) => h.id).sort(), ["x1", "x2", "x3"]) && hAll.find((h) => h.id === "x3")!.needsClip === false, "both players: every unchecked best holds; a clip waiting doesn't need another", hAll);
  check(matchHolds("a", "b", ["t1"], 7, [pt("y1", "a", "t1", 90_000), pt("y2", "a", "t1", 89_000, "rejected")], 1)[0]?.id === "y1", "a rejected time isn't anyone's best");
  check(matchHolds("a", "b", ["t1"], 7, [pt("z1", "a", "t1", 90_000), pt("z2", "b", "t1", 90_000)], 1).length === 2, "a tie: both are the faster time");
  check(matchHolds("a", "b", ["t1"], 8, ts, -1).length === 0, "times from another round don't hold this match");
  const st = matchProofStates("a", "b", ["t1", "t2"], 7, ts, 1);
  check(st.get("t1")!.get("a")!.state === "clip" && st.get("t2")!.get("b")!.state === "checked" && !st.get("t1")!.get("b"), "the card: clip needed, checked, or nothing to show", [...st.get("t1")!]);

  // A bracket match the times decide waits for the faster time's clip; checked, it settles; closing skips the check.
  const se2 = generateSingleElim(["p1", "p2", "p3", "p4"]);
  const m0 = se2.matches.find((m) => m.round === 0 && isOpenMatch(m))!;
  const bt = (id: string, pid: string, ms: number, proof: TtBracketTime["proof"] = "none"): TtBracketTime =>
    ({ participantId: pid, round: bracketTtRound(m0), track: "t1", ms, counts: proof !== "rejected", id, proof, video: null });
  const held = settleBracket(se2, ["t1", "t2"], 1, [bt("b1", m0.a!, 90_000), bt("b2", m0.b!, 91_000)], null, 1);
  check(held.settled.length === 0, "decided but the winner's clip isn't checked: the match waits");
  const ok1 = settleBracket(se2, ["t1", "t2"], 1, [bt("b1", m0.a!, 90_000, "checked"), bt("b2", m0.b!, 91_000)], null, 1);
  check(eq(ok1.settled, [m0.id]), "the winner's time is checked: it settles (the slower time needs no clip on rule 1)");
  const okAll = settleBracket(se2, ["t1", "t2"], 1, [bt("b1", m0.a!, 90_000, "checked"), bt("b2", m0.b!, 91_000)], null, -1);
  check(okAll.settled.length === 0, "both players' clips asked: the loser's unchecked time still holds it");
  const closed = settleBracket(se2, ["t1", "t2"], 1, [bt("b1", m0.a!, 90_000), bt("b2", m0.b!, 91_000)], m0.id, 1);
  check(closed.settled.includes(m0.id), "the organizer settling on the times so far skips the check");
  const noIds = settleBracket(se2, ["t1", "t2"], 1, [t2(m0.a!, 90_000), t2(m0.b!, 91_000)], null, 1);
  function t2(pid: string, ms: number): TtBracketTime { return { participantId: pid, round: bracketTtRound(m0), track: "t1", ms, counts: true }; }
  check(noIds.settled.length === 1, "times without proof data (the browser's, no ids) aren't held");
  const rejected = settleBracket(se2, ["t1", "t2"], 1, [bt("b1", m0.a!, 90_000, "rejected"), bt("b2", m0.b!, 91_000, "checked")], null, 1);
  check(rejected.settled.length === 0, "the winner's time rejected: it no longer counts, the match is open again");

  // Swiss: the same hold on reports.
  const settings = swissSettingsOf({ swiss: { rounds: 3, topCut: 0, bestOf: 1 } }, false);
  const fresh = newSwissState(settings, 4);
  const tables = pairNextRound(fresh, [], ["p1", "p2", "p3", "p4"], () => 0.5, "seed");
  const state = { ...fresh, list: [{ n: 1, tables, results: {}, pairedAt: new Date(0).toISOString() }] } as typeof fresh;
  const tb = tables.find((x) => x.b)!;
  const sw = (id: string, pid: string, ms: number, proof: TtSwissTime["proof"] = "none"): TtSwissTime => ({ participantId: pid, round: 1, track: "t1", ms, counts: proof !== "rejected", id, proof, video: null });
  const swTimes = [sw("s1", tb.a, 90_000), sw("s2", tb.b!, 91_000)];
  check(reportsFromTimes(state, ["t1"], swTimes).length === 2, "Swiss, screenshots only: the match reports as soon as both times are in");
  check(reportsFromTimes(state, ["t1"], swTimes, new Set(), 1).length === 0, "Swiss, faster time's clip: it waits");
  check(reportsFromTimes(state, ["t1"], [sw("s1", tb.a, 90_000, "checked"), sw("s2", tb.b!, 91_000)], new Set(), 1).length === 2, "Swiss: checked, it reports");
  check(reportsFromTimes(state, ["t1"], swTimes, new Set(["r1"]), 1).some((r) => r.participantId === tb.a && r.mine === 1), "Swiss: settling the round on the times so far skips the check");
}

// Proof and windows.
check(clipNeeded(3, 1) && clipNeeded(3, 3) && !clipNeeded(3, 4), "top 3 need a clip");
check(clipNeeded(-1, 40) && !clipNeeded(0, 1) && !clipNeeded(3, null), "everyone, nobody, no time");
check(inWindow("2026-11-10T20:00:00Z", "2026-11-10T19:00:00Z", "2026-11-10T21:00:00Z") && !inWindow("2026-11-10T18:59:59Z", "2026-11-10T19:00:00Z", null), "times count only inside the window");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
