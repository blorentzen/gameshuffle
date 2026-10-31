/**
 * Swiss engine checks (pure): the handbook's structure table, pairing (no
 * rematches, one bye each, byes from the lowest bracket), standings and
 * tiebreakers, drops and late joiners, the top cut and final placements.
 * Simulates whole events of many sizes with random results.
 *
 *   npx tsx scripts/test-swiss.ts
 */

import {
  cutBracket, cutSeeds, describeStructure, finalPlacements, lockRound, newSwissState, nextStep, pairNextRound,
  roundDone, roundKey, scoreChoices, structureFor, suggestStructure, swissPhase, swissSettingsOf, swissStandings,
  tableStatus, validScore, currentMatchFor, cutKey, secondsLeft, clockText,
  type SwissReport, type SwissState, type SwissResult,
} from "@/lib/tournaments/swiss";

let passed = 0, failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else { failed++; console.log(`✗ ${name}`, detail === undefined ? "" : JSON.stringify(detail).slice(0, 400)); }
}

// ─── The handbook table (Sept 1, 2026, Variant #3: TCG Single Day) ───
const table: [number, number, number][] = [[4, 3, 0], [8, 3, 0], [9, 4, 4], [12, 4, 4], [13, 5, 4], [20, 5, 4], [21, 5, 8], [32, 5, 8], [33, 6, 8], [64, 6, 8], [65, 7, 8], [128, 7, 8], [129, 8, 8], [226, 8, 8], [227, 9, 8], [409, 9, 8], [410, 10, 8], [900, 10, 8]];
for (const [n, rounds, cut] of table) {
  const s = suggestStructure(n);
  check(`structure for ${n}`, s.rounds === rounds && s.topCut === cut, s);
}
const auto = swissSettingsOf({}, true);
check("defaults: auto, best of 3, 50 minutes for a card game", auto.rounds === "auto" && auto.topCut === "auto" && auto.bestOf === 3 && auto.roundMinutes === 50);
check("defaults: no clock for other games", swissSettingsOf({}, false).roundMinutes === null);
check("a Top 8 cut for 6 players shrinks", structureFor({ ...auto, topCut: 8 }, 6).topCut === 4);
check("a cut never takes the whole field", structureFor({ ...auto, topCut: 4 }, 4).topCut === 0);
check("organizer rounds win", structureFor({ ...auto, rounds: 6 }, 16).rounds === 6);
check("the 16-player line reads right", describeStructure(auto, 16).startsWith("5 rounds of Swiss, then a Top 4 bracket. Best of 3, 50 minutes a round."), describeStructure(auto, 16));
check("bad settings fall back", JSON.stringify(swissSettingsOf({ swiss: { rounds: 99, topCut: 5, bestOf: 2, roundMinutes: -1 } }, true)) === JSON.stringify(auto));

// ─── Scores ───
check("best of 3: 2-1 is fine", validScore(3, 2, 1));
check("best of 3: 3-0 isn't", !validScore(3, 3, 0));
check("best of 3: 2-2 isn't", !validScore(3, 2, 2));
check("best of 3: 1-1 is a tie", validScore(3, 1, 1));
check("top cut can't tie", !validScore(3, 1, 1, true));
check("best of 1 choices", scoreChoices(1).map((c) => c.label).join(",") === "I won,I lost,Tie");
check("top cut choices have no tie", !scoreChoices(3, true).some((c) => c.label === "Tie"));

// ─── Simulated events ───
let seed = 7;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const bo3: [number, number][] = [[2, 0], [2, 1], [1, 2], [0, 2], [1, 1]];

/** Plays every table of the latest round: both players report the same score, one in ten tables disagree and the organizer settles. */
function playRound(state: SwissState, reports: SwissReport[]): SwissState {
  const round = state.list[state.list.length - 1];
  for (const t of round.tables) {
    if (!t.b) continue;
    const [a, b] = bo3[Math.floor(rand() * bo3.length)];
    reports.push({ matchKey: roundKey(round.n), participantId: t.a, mine: a, theirs: b });
    if (rand() < 0.1 && a !== b) {
      reports.push({ matchKey: roundKey(round.n), participantId: t.b, mine: a, theirs: b }); // says the same as A: a disagreement
      const st = tableStatus(state, round, t, reports);
      check("a disagreement is flagged", st.state === "disagree" && !st.result, st);
      round.results[String(t.t)] = { a, b, by: "organizer" };
    } else {
      reports.push({ matchKey: roundKey(round.n), participantId: t.b, mine: b, theirs: a });
    }
  }
  return state;
}

function runEvent(n: number, opts: { drops?: number; late?: number } = {}) {
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  let field = [...ids];
  let state = newSwissState(auto, n);
  state.version = 1;
  const reports: SwissReport[] = [];
  const pairedIn = new Map<string, number>();
  const byes = new Map<string, number>();
  let rematches = 0;
  const met = new Set<string>();
  const key = (a: string, b: string) => [a, b].sort().join("|");

  while (nextStep(state, reports) === "pair") {
    const roundNo = state.list.length + 1;
    // Drop someone after round 2, add a late player before round 3.
    if (opts.drops && roundNo === 3) for (const id of field.slice(0, opts.drops)) state.drops[id] = 2;
    if (opts.late && roundNo === 3) for (let i = 0; i < opts.late; i++) { const id = `late${i}`; field.push(id); state.lateFrom[id] = 3; }
    if (state.list.length) state.list[state.list.length - 1] = lockRound(state, state.list[state.list.length - 1], reports);
    const before = swissStandings(state, reports, field, "t");
    const tables = pairNextRound(state, reports, field, rand, "t");
    const active = field.filter((id) => !(id in state.drops));
    const seated = tables.flatMap((t) => (t.b ? [t.a, t.b] : [t.a]));
    check(`${n}p r${roundNo}: everyone active plays once`, seated.length === active.length && new Set(seated).size === active.length, { seated: seated.length, active: active.length });
    check(`${n}p r${roundNo}: dropped players aren't paired`, !seated.some((id) => id in state.drops));
    check(`${n}p r${roundNo}: one bye at most`, tables.filter((t) => !t.b).length === active.length % 2);
    const bye = tables.find((t) => !t.b);
    if (bye) {
      byes.set(bye.a, (byes.get(bye.a) ?? 0) + 1);
      if (roundNo > 1) {
        const pts = new Map(before.map((r) => [r.id, r.points]));
        const freshLowest = Math.min(...active.filter((id) => !(byes.get(id) && id !== bye.a)).map((id) => pts.get(id) ?? 0));
        check(`${n}p r${roundNo}: the bye goes to the lowest bracket`, (pts.get(bye.a) ?? 0) === freshLowest, { bye: pts.get(bye.a), freshLowest });
      }
    }
    check(`${n}p r${roundNo}: tables numbered 1..k`, tables.every((t, i) => t.t === i + 1));
    for (const t of tables) if (t.b) { if (met.has(key(t.a, t.b))) rematches++; met.add(key(t.a, t.b)); }
    for (const id of seated) pairedIn.set(id, (pairedIn.get(id) ?? 0) + 1);
    state = { ...state, list: [...state.list, { n: roundNo, pairedAt: new Date().toISOString(), tables, results: {} }] };
    check(`${n}p r${roundNo}: a fresh round isn't done`, !roundDone(state, state.list[state.list.length - 1], reports) || tables.every((t) => !t.b));
    check(`${n}p r${roundNo}: next step waits for results`, nextStep(state, reports) === "wait" || tables.every((t) => !t.b));
    playRound(state, reports);
  }
  check(`${n}p: plays the planned rounds`, state.list.length === state.rounds, { played: state.list.length, planned: state.rounds });
  check(`${n}p: nobody gets two byes`, [...byes.values()].every((x) => x <= 1), Object.fromEntries(byes));
  if (n >= 8 && !opts.drops) check(`${n}p: no rematches`, rematches === 0, rematches);

  const standings = swissStandings(state, reports, field, "t");
  // Points always match the record.
  check(`${n}p: points = 3 × wins + ties`, standings.every((r) => r.points === r.wins * 3 + r.ties));
  check(`${n}p: sorted by points`, standings.every((r, i) => i === 0 || standings[i - 1].points >= r.points));
  check(`${n}p: tiebreakers sort ties`, standings.every((r, i) => i === 0 || standings[i - 1].points > r.points || standings[i - 1].owp >= r.owp));
  check(`${n}p: win % floored at 25%`, standings.every((r) => r.winPct >= 0.25 || r.wins + r.losses + r.ties === 0));
  check(`${n}p: a dropped player's win % tops out at 75%`, standings.filter((r) => r.dropped).every((r) => r.winPct <= 0.75));
  check(`${n}p: every player has a record of the rounds they played`, standings.filter((r) => !r.dropped).every((r) => r.wins + r.losses + r.ties === state.rounds), standings.filter((r) => !r.dropped).map((r) => r.wins + r.losses + r.ties));
  for (let i = 0; i < (opts.late ?? 0); i++) {
    const r = standings.find((x) => x.id === `late${i}`)!;
    check(`${n}p: a late joiner has losses for the rounds they missed`, r.losses >= 2, r);
  }

  // Top cut, then finish.
  const step = nextStep(state, reports);
  check(`${n}p: after Swiss the next step is ${state.topCut ? "the cut" : "finish"}`, step === (state.topCut ? "cut" : "finish"), step);
  if (state.topCut) {
    state.list[state.list.length - 1] = lockRound(state, state.list[state.list.length - 1], reports);
    const seeds = cutSeeds(standings, state.topCut);
    check(`${n}p: cut seeds are the top of the standings without drops`, seeds.length === state.topCut && seeds.every((id) => !(id in state.drops)));
    state = { ...state, cut: { seeds, results: {} } };
    check(`${n}p: phase is the cut`, swissPhase(state) === "cut");
    for (let guard = 0; guard < 10 && nextStep(state, reports) === "wait"; guard++) {
      const b = cutBracket(state, reports)!;
      for (const m of b.matches.filter((x) => x.a && x.b && !x.winner)) {
        const cm = currentMatchFor(state, reports, m.a!);
        check(`${n}p: a cut player's current match is their bracket match`, cm?.key === cutKey(m.id) && cm.cut, cm);
        reports.push({ matchKey: cutKey(m.id), participantId: m.a!, mine: 2, theirs: 1 });
        reports.push({ matchKey: cutKey(m.id), participantId: m.b!, mine: 1, theirs: 2 });
      }
    }
    check(`${n}p: the cut finishes`, nextStep(state, reports) === "finish");
    const b = cutBracket(state, reports)!;
    const final = b.matches.find((m) => m.round === b.rounds - 1)!;
    check(`${n}p: the top seed wins when side a always wins`, final.winner === seeds[0], { winner: final.winner, top: seeds[0] });
  }
  const places = finalPlacements(state, reports, standings);
  const everyone = new Set(standings.map((r) => r.id));
  check(`${n}p: every player gets a placement`, places.length === everyone.size && places.every((p) => everyone.has(p.participantId)));
  check(`${n}p: first place is unique`, places.filter((p) => p.placement === 1).length === 1);
  if (!state.topCut) check(`${n}p: without a cut, placements follow the standings`, places.every((p, i) => p.participantId === standings[i].id));
  return { state, reports, standings };
}

for (const n of [4, 5, 6, 7, 8, 9, 11, 12, 13, 16, 17, 20, 21, 24, 31, 32, 33, 40, 64, 65]) runEvent(n);
runEvent(16, { drops: 2 });
runEvent(13, { late: 2 });
runEvent(9, { drops: 1, late: 1 });
for (let i = 0; i < 25; i++) runEvent(10 + Math.floor(rand() * 40));

// ─── Tiebreakers by hand ───
{
  // A beats B, B beats C, C beats D... a small round to check head-to-head and win %.
  const st = newSwissState(auto, 4);
  const R = (n: number, tables: [string, string | null][], results: Record<string, SwissResult>) => ({ n, pairedAt: "", tables: tables.map(([a, b], i) => ({ t: i + 1, a, b })), results });
  st.list = [
    R(1, [["A", "B"], ["C", "D"]], { 1: { a: 2, b: 0, by: "organizer" }, 2: { a: 2, b: 0, by: "organizer" } }),
    R(2, [["A", "C"], ["B", "D"]], { 1: { a: 0, b: 2, by: "organizer" }, 2: { a: 2, b: 0, by: "organizer" } }),
    R(3, [["A", "D"], ["B", "C"]], { 1: { a: 2, b: 0, by: "organizer" }, 2: { a: 2, b: 1, by: "organizer" } }),
  ];
  const s = swissStandings(st, [], ["A", "B", "C", "D"], "x");
  const by = Object.fromEntries(s.map((r) => [r.id, r]));
  check("records: A 2-1, B 2-1, C 2-1, D 0-3", [by.A, by.B, by.C].every((r) => r.wins === 2 && r.losses === 1) && by.D.losses === 3);
  check("D's win % is floored at 25%", by.D.winPct === 0.25, by.D.winPct);
  check("A's opponents' win % = avg(B, C, D)", Math.abs(by.A.owp - (2 / 3 + 2 / 3 + 0.25) / 3) < 0.001, by.A.owp);
  check("D is last", s[3].id === "D");
}
{
  // Exactly two tied on everything: head-to-head decides.
  const st = newSwissState(auto, 2);
  st.list = [{ n: 1, pairedAt: "", tables: [{ t: 1, a: "X", b: "Y" }], results: { 1: { a: 1, b: 1, by: "organizer" } } },
    { n: 2, pairedAt: "", tables: [{ t: 1, a: "Y", b: "X" }], results: { 1: { a: 2, b: 0, by: "organizer" } } },
    { n: 3, pairedAt: "", tables: [{ t: 1, a: "X", b: "Y" }], results: { 1: { a: 2, b: 0, by: "organizer" } } }];
  // X and Y: one win, one loss, one tie each, same tiebreakers; the last meeting... both have a W and an L against each other.
  const s = swissStandings(st, [], ["X", "Y"], "seed");
  check("tied players get a fixed order", s.length === 2 && swissStandings(st, [], ["X", "Y"], "seed")[0].id === s[0].id);
}
{
  // A bye counts as a win, not as a tiebreaker win.
  const st = newSwissState(auto, 3);
  st.list = [{ n: 1, pairedAt: "", tables: [{ t: 1, a: "A", b: "B" }, { t: 2, a: "C", b: null }], results: { 1: { a: 2, b: 0, by: "organizer" } } }];
  const s = swissStandings(st, [], ["A", "B", "C"]);
  const C = s.find((r) => r.id === "C")!;
  check("a bye is a win on the record", C.wins === 1 && C.byes === 1 && C.points === 3);
  check("a bye isn't a win for win %", C.winPct === 0.25, C.winPct);
  check("a bye has no opponent", C.opponents.length === 0 && C.owp === 0);
}

// ─── The clock ───
{
  const t0 = Date.parse("2026-11-01T18:00:00Z");
  const timer = { minutes: 50, startedAt: new Date(t0).toISOString(), pausedAt: null, extraSeconds: 0 };
  check("50:00 at the start", secondsLeft(timer, t0) === 3000);
  check("+5 minutes adds 300s", secondsLeft({ ...timer, extraSeconds: 300 }, t0) === 3300);
  check("paused clocks stop", secondsLeft({ ...timer, pausedAt: new Date(t0 + 60_000).toISOString() }, t0 + 600_000) === 2940);
  check("Time when it runs out", clockText(secondsLeft(timer, t0 + 3_001_000)) === "Time");
  check("no clock = null", secondsLeft({ ...timer, minutes: null }, t0) === null);
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
