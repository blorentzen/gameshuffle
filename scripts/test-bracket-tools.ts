// The free bracket tools' rules (src/lib/brackets/*).
//   npx tsx scripts/test-bracket-tools.ts
import { decodeLink, encodeLink, parseNames, readHandoff, roundRobinAsSwiss, MAX_PLAYERS } from "../src/lib/brackets/tool";
import { buildElim, decodePicks, eliminationChampion, eliminationPlaces, encodePicks, isBye, pickWinner, playableMatches, type ElimKind, type Picks } from "../src/lib/brackets/elim";
import { decodeRR, encodeRR, roundRobinSchedule, roundRobinStandings, type RRResult } from "../src/lib/brackets/roundRobin";
import { currentRound, cutView, decodeSwiss, dropPlayer, encodeSwiss, pairNext, pickCut, repairRound, setResult, startCut, startSwiss, swissStep, swissTable, swissWinner, type SwissTool } from "../src/lib/brackets/swissTool";

let pass = 0, fail = 0;
const ok = (cond: boolean, what: string) => { if (cond) pass++; else { fail++; if (fail < 40) console.error("✗", what); } };

// Seeded random so a failure can be replayed.
let s = 12345;
const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };

// ── Names ──
const p1 = parseNames("Sam\n  Riley \n\n1. Alex\n- Jo\nsam");
ok(p1.names.join("|") === "Sam|Riley|Alex|Jo|sam (2)", "names: trims, list markers, repeats numbered");
ok(p1.repeats.length === 1, "one repeat noted");
ok(parseNames("A, B, C").names.length === 3, "one line splits on commas");
ok(parseNames("Smith, John\nDoe, Jane").names.length === 2, "several lines keep their commas");
const many = parseNames(Array.from({ length: 70 }, (_, i) => `P${i}`).join("\n"));
ok(many.names.length === MAX_PLAYERS && many.over === 6, "64 at most, the rest counted");

// ── Links ──
const link = encodeLink({ f: "single", names: ["Zoë", "Ana"], title: "Friday night", options: { x: 1 }, results: "0" });
const back = decodeLink(link);
ok(!!back && back.names.join() === "Zoë,Ana" && back.title === "Friday night" && back.f === "single", "link round trip keeps names and accents");
ok(decodeLink("not-base64!!") === null && decodeLink("") === null, "a broken link reads as nothing");
ok(decodeLink(encodeLink({ f: "double", names: ["A", "B"], title: "", options: {}, results: null })) === null, "double elimination needs 4");

// ── Handoff ──
ok(readHandoff(JSON.stringify({ format: "swiss", names: ["A", "B", "C"], title: "", at: Date.now(), from: "roundrobin", swissRounds: 3 }))?.swissRounds === 3, "handoff reads");
ok(readHandoff(JSON.stringify({ format: "swiss", names: ["A", "B"], title: "", at: Date.now() - 2 * 86400_000 })) === null, "an old handoff is ignored");
ok(roundRobinAsSwiss(8) === 7 && roundRobinAsSwiss(7) === 7 && roundRobinAsSwiss(20) === 12, "round robin as Swiss rounds");

// ── Elimination ──
function playOut(kind: ElimKind, count: number) {
  let picks: Picks = {};
  let view = buildElim(kind, count, picks);
  for (let guard = 0; guard < 400; guard++) {
    const open = playableMatches(view.bracket).filter((m) => !m.winner);
    if (!open.length) break;
    const m = open[0];
    const w = Number(rand() < 0.5 ? m.a : m.b);
    view = pickWinner(kind, count, picks, m.id, w);
    picks = view.picks;
  }
  return { view, picks };
}
for (const kind of ["single", "double"] as ElimKind[]) {
  for (let count = kind === "single" ? 2 : 4; count <= 64; count++) {
    const { view, picks } = playOut(kind, count);
    const champ = eliminationChampion(view.bracket);
    ok(champ != null && champ < count, `${kind} ${count}: a champion`);
    const places = eliminationPlaces(view.bracket);
    ok(places.length === count, `${kind} ${count}: everyone placed (${places.length})`);
    ok(new Set(places.map((p) => p.player)).size === count, `${kind} ${count}: each player once`);
    ok(places.filter((p) => p.place === 1).length === 1, `${kind} ${count}: one winner`);
    ok(!view.bracket.matches.some((m) => isBye(m.winner) && m.group === "gf"), `${kind} ${count}: no bye reaches the final`);
    // Link round trip rebuilds the same bracket.
    const again = buildElim(kind, count, decodePicks(kind, count, encodePicks(kind, count, picks)));
    ok(eliminationChampion(again.bracket) === champ && JSON.stringify(again.picks) === JSON.stringify(picks), `${kind} ${count}: link rebuilds`);
    // Changing the first real match drops later picks that no longer fit.
    const first = playableMatches(view.bracket).find((m) => m.round === 0 && m.group === "wb");
    if (first) {
      const other = Number(first.winner === first.a ? first.b : first.a);
      const changed = pickWinner(kind, count, picks, first.id, other);
      ok(changed.picks[first.id] === other, `${kind} ${count}: a pick can change`);
      ok(changed.bracket.matches.every((m) => !m.winner || m.winner === m.a || m.winner === m.b), `${kind} ${count}: winners stay in their matches`);
      ok(Object.entries(changed.picks).every(([id, w]) => changed.bracket.matches.find((m) => m.id === id)?.winner === String(w)), `${kind} ${count}: kept picks all applied`);
    }
  }
}

// ── Round robin ──
for (let n = 3; n <= 64; n++) {
  for (const legs of [1, 2] as const) {
    const sch = roundRobinSchedule(n, legs);
    const pairs = new Map<string, number>();
    for (const m of sch.matches) { const k = m.a < m.b ? `${m.a}-${m.b}` : `${m.b}-${m.a}`; pairs.set(k, (pairs.get(k) ?? 0) + 1); }
    ok(pairs.size === (n * (n - 1)) / 2 && [...pairs.values()].every((c) => c === legs), `round robin ${n}x${legs}: everyone meets ${legs}x`);
    let clash = false;
    for (let r = 0; r < sch.rounds; r++) {
      const inRound = sch.matches.filter((m) => m.round === r).flatMap((m) => [m.a, m.b]);
      if (new Set(inRound).size !== inRound.length) clash = true;
    }
    ok(!clash, `round robin ${n}x${legs}: nobody twice in a round`);
    if (n % 2) {
      const byes = sch.byes.filter((b): b is number => b != null);
      ok(byes.length === sch.rounds && new Set(byes.slice(0, n)).size === n, `round robin ${n}: everyone sits out once a leg`);
    }
    if (legs === 1 && n <= 20) {
      const results: (RRResult | null)[] = sch.matches.map(() => (["a", "b", "t"] as RRResult[])[Math.floor(rand() * 3)]);
      const table = roundRobinStandings(n, sch, results);
      ok(table.every((r) => r.played === n - 1), `round robin ${n}: everyone played n-1`);
      ok(table.reduce((t, r) => t + r.wins, 0) === table.reduce((t, r) => t + r.losses, 0), `round robin ${n}: wins = losses`);
      ok(table.every((r, i) => i === 0 || table[i - 1].points >= r.points), `round robin ${n}: sorted by points`);
      ok(decodeRR(encodeRR(results), results.length, true).join() === results.join(), `round robin ${n}: link round trip`);
      ok(!decodeRR(encodeRR(results), results.length, false).includes("t"), `round robin ${n}: ties dropped when ties are off`);
    }
  }
}

// ── Swiss ──
function playSwiss(count: number, withCut: boolean): SwissTool {
  let t = startSwiss(count, { rounds: "auto", topCut: withCut ? "auto" : 0 }, rand);
  for (let guard = 0; guard < 50; guard++) {
    const step = swissStep(t);
    if (step === "results") {
      const r = currentRound(t)!;
      for (const tb of r.tables) if (tb.b && !r.results[String(tb.t)]) t = setResult(t, tb.t, rand() < 0.1 ? "t" : rand() < 0.5 ? "a" : "b");
    } else if (step === "pair") t = pairNext(t, rand);
    else if (step === "cut") t = startCut(t);
    else if (step === "cut-results") {
      const v = cutView(t)!;
      const m = v.bracket.matches.find((x) => x.a && x.b && !x.winner)!;
      t = pickCut(t, m.id, Number(rand() < 0.5 ? m.a : m.b));
    } else break;
  }
  return t;
}
for (let count = 4; count <= 64; count++) {
  const t = playSwiss(count, true);
  ok(swissStep(t) === "done", `swiss ${count}: finishes`);
  ok(t.swiss.list.length === t.swiss.rounds, `swiss ${count}: all rounds played`);
  const met = new Set<string>();
  let rematch = false;
  for (const r of t.swiss.list) for (const tb of r.tables) if (tb.b) { const k = [tb.a, tb.b].sort().join("-"); if (met.has(k)) rematch = true; met.add(k); }
  ok(!rematch, `swiss ${count}: no rematches`);
  const byes = t.swiss.list.flatMap((r) => r.tables.filter((tb) => !tb.b).map((tb) => tb.a));
  ok(new Set(byes).size === byes.length, `swiss ${count}: nobody gets two byes`);
  ok(swissWinner(t) != null, `swiss ${count}: a winner`);
  ok(swissTable(t).length === count, `swiss ${count}: everyone in the standings`);
  const again = decodeSwiss(count, JSON.parse(JSON.stringify(encodeSwiss(t))));
  ok(!!again && JSON.stringify(encodeSwiss(again)) === JSON.stringify(encodeSwiss(t)), `swiss ${count}: link rebuilds`);
  ok(!!again && swissWinner(again) === swissWinner(t), `swiss ${count}: same winner from the link`);
}
// Re-pairing, results only in the round in play, dropping.
{
  let t = startSwiss(9, { rounds: "auto", topCut: 0 }, rand);
  const before = JSON.stringify(currentRound(t)!.tables);
  t = repairRound(t, rand);
  ok(currentRound(t)!.n === 1, "re-pair keeps round 1");
  ok(typeof before === "string", "re-pair runs");
  t = setResult(t, 1, "a");
  const locked = repairRound(t, rand);
  ok(locked === t, "no re-pair once a result is in");
  for (const tb of currentRound(t)!.tables) if (tb.b) t = setResult(t, tb.t, "a");
  t = dropPlayer(t, 3);
  ok("3" in t.swiss.drops, "a player can drop between rounds");
  t = pairNext(t, rand);
  ok(!currentRound(t)!.tables.some((tb) => tb.a === "3" || tb.b === "3"), "a dropped player isn't paired");
  ok(decodeSwiss(9, { s: [3, 0], l: ["01a01b"] }) === null, "a player twice in a round is refused");
  ok(decodeSwiss(9, { s: [3, 0], l: ["01.", "23a"] }) === null, "an unfinished earlier round is refused");
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
