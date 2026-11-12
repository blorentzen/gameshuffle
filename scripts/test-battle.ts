/**
 * Trainer battles engine (src/lib/originals/duel/battle.ts): the coin and weather, leads, the first-turn rule, legal
 * steps, clock timeouts, views from each side, and a thousand random battles that must end and replay the same.
 * Run: npx tsx -r ./scripts/server-only-shim.cjs scripts/test-battle.ts
 */

import { DUEL_DATA } from "../src/lib/originals/duel/data";
import {
  BRING, MISSES_LOSE, ROUND_CAP, applyBattle, battleView, coinFor, isLegalStep, leadsDone, makeBattle, other, replayBattle,
  sendOut, sendable, standing, startBattle, timeOut, waitingOn, weatherFor, type BattleSetup, type BattleState, type BattleStep, type Side,
} from "../src/lib/originals/duel/battle";
import type { DuelCard } from "../src/lib/originals/duel/types";

let pass = 0;
let fail = 0;
const ok = (cond: boolean, msg: string) => { if (cond) pass++; else { fail++; console.log("FAIL", msg); } };

// Gym Leader teams with at least three cards, as the lobby offers them.
const teams = DUEL_DATA.trainers.filter((t) => t.tier === "gym" && t.team.length >= BRING);
const cardsOf = (id: string): DuelCard[] => DUEL_DATA.trainers.find((t) => t.id === id)!.team.map((c) => DUEL_DATA.cards[c]).filter(Boolean);
ok(teams.length > 50, `enough gym teams (${teams.length})`);

let rng = 12345;
const rand = (n: number) => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng % n; };

function battle(seed: string): BattleSetup {
  const a = cardsOf(teams[rand(teams.length)].id).slice(0, BRING);
  const b = cardsOf(teams[rand(teams.length)].id).slice(0, BRING);
  return makeBattle(seed, ["Sam", "Riley"], [a, b]);
}

/** Every legal step for a side right now. */
function stepsFor(setup: BattleSetup, s: BattleState, me: Side): BattleStep[] {
  const out: BattleStep[] = [];
  const b = s.sides[me];
  if (!leadsDone(s)) { for (const i of sendable(b)) out.push({ lead: i }); return out.filter((st) => isLegalStep(setup, s, me, st)); }
  if (sendOut(s) === me) { for (const i of sendable(b)) out.push({ next: i }); return out; }
  for (let use = 0; use < b.hand.length; use++) {
    for (const at of sendable(b)) {
      for (let mi = 0; mi < setup.teams[me][Math.max(0, b.active)].moves.length; mi++) out.push({ attach: at, act: { move: mi }, use });
      for (const w of sendable(b)) out.push({ attach: at, act: { swap: w }, use });
      out.push({ attach: at, act: { wait: true }, use });
    }
  }
  return out.filter((st) => isLegalStep(setup, s, me, st));
}

// ─── the coin and the weather ────────────────────────────────────────────────
{
  const seen = new Set<Side>();
  for (let i = 0; i < 200; i++) seen.add(coinFor(`seed-${i}`));
  ok(seen.size === 2, "the coin lands both ways across seeds");
  ok(coinFor("abc") === coinFor("abc"), "the coin is the same every time for a seed");
  const w = weatherFor("abc");
  ok(w.length > 3 && w[0].turn === 3, "weather starts at round 3");
  ok(w.every((e, i) => ["rain", "sun", "sand"].includes(e.kind) && (i === 0 || e.turn - w[i - 1].turn >= 3) && e.turn <= ROUND_CAP), "weather only, 3 or more rounds apart, inside the cap");
}

// ─── leads ───────────────────────────────────────────────────────────────────
{
  const setup = battle("leads");
  let s = startBattle(setup);
  ok(!leadsDone(s) && waitingOn(s).length === 2, "both pick a lead first");
  ok(applyBattle(setup, s, 0, { attach: 0, act: { wait: true } }) === null, "no turn before the leads");
  s = applyBattle(setup, s, 0, { lead: 1 })!;
  ok(!!s && s.sides[0].active === 1 && !leadsDone(s), "one lead in, still waiting");
  const v1 = battleView(setup, s, 1);
  ok(v1.fi === -1, "the other lead is hidden until both are in");
  ok(applyBattle(setup, s, 0, { lead: 2 }) === null, "a lead can't be changed once picked");
  s = applyBattle(setup, s, 1, { lead: 0 })!;
  ok(leadsDone(s) && s.turn === 1 && s.side === setup.first && s.round === 1, "both in: turn 1, the coin's player goes first");
  const first = setup.first;
  const v = battleView(setup, s, first);
  ok(!v.canMove, "no attack on the very first turn");
  ok(stepsFor(setup, s, first).every((st) => !("act" in st) || !("move" in st.act)), "no move is legal on turn 1");
  ok(stepsFor(setup, s, other(first)).length === 0, "the other player can't act on the first player's turn");
  const vo = battleView(setup, s, other(first));
  ok(vo.energy.hand !== null && vo.attachTo.length === 0, "the waiting player sees their own hand but has no actions");
  ok(JSON.stringify(vo.energy.hand) === JSON.stringify(s.sides[other(first)].hand), "each player sees only their own hand");
  const spec = battleView(setup, s, 0, true);
  ok(spec.energy.hand === null && spec.attachTo.length === 0 && !spec.canMove, "a spectator sees no hand and can't act");
  // Turn 1: Energy and wait, then the second player can attack.
  const s2 = applyBattle(setup, s, first, { attach: s.sides[first].active, act: { wait: true }, use: 0 })!;
  ok(!!s2 && s2.side === other(first) && s2.turn === 2 && s2.round === 1, "turn 2 is the other player's, same round");
  ok(s2.sides[first].slots[s.sides[first].active].energy.length === 1, "the Energy went on");
  ok(s2.sides[first].hand.length === 3 && s2.sides[first].drawn === 4, "the hand refills from the row");
}

// ─── the clock ───────────────────────────────────────────────────────────────
{
  const setup = battle("clock");
  let s = startBattle(setup);
  s = timeOut(setup, s);
  ok(leadsDone(s), "a timed-out lead picks the cards with the most HP for both");
  const slow = s.side;
  for (let k = 0; k < MISSES_LOSE - 1; k++) {
    s = timeOut(setup, s);
    ok(s.over == null, `missed turn ${k + 1} doesn't lose yet`);
    // The other player plays a real turn.
    const steps = stepsFor(setup, s, s.side);
    s = applyBattle(setup, s, s.side, steps.find((st) => "act" in st && "wait" in st.act) ?? steps[0])!;
  }
  ok(s.sides[slow].missed === MISSES_LOSE - 1, "missed turns are counted");
  s = timeOut(setup, s);
  ok(s.over === other(slow) && s.why === "timeout", "the third missed turn loses");
}

// ─── a thousand random battles ───────────────────────────────────────────────
{
  let ended = 0;
  let replayed = 0;
  let knockouts = 0;
  let caps = 0;
  let sendOuts = 0;
  for (let n = 0; n < 1000; n++) {
    const setup = battle(`r${n}`);
    let s = startBattle(setup);
    const log: { by: Side | "clock"; st?: BattleStep }[] = [];
    let guard = 0;
    while (s.over == null && guard++ < 400) {
      const who = waitingOn(s);
      if (!who.length) break;
      const me = who[rand(who.length)];
      if (sendOut(s) === me) sendOuts++;
      // Now and then the clock runs out instead.
      if (rand(20) === 0) { s = timeOut(setup, s); log.push({ by: "clock" }); continue; }
      const steps = stepsFor(setup, s, me);
      if (!steps.length) { fail++; console.log("FAIL no legal step", n, JSON.stringify(s).slice(0, 300)); break; }
      // Prefer attacks so battles end.
      const moves = steps.filter((st) => "act" in st && "move" in st.act);
      const st = moves.length && rand(4) ? moves[rand(moves.length)] : steps[rand(steps.length)];
      const next = applyBattle(setup, s, me, st);
      if (!next) { fail++; console.log("FAIL legal step refused", n); break; }
      log.push({ by: me, st });
      s = next;
      // Invariants.
      if (s.over == null && leadsDone(s) && waitingOn(s).length !== 1) { fail++; console.log("FAIL waits on one side at a time", n); break; }
      if (s.sides.some((b) => b.hand.length !== 3)) { fail++; console.log("FAIL hand of 3", n); break; }
    }
    if (s.over != null) ended++;
    if (s.why === "knockout") knockouts++;
    if (s.why === "cap") caps++;
    if (s.why === "knockout" && s.over !== "draw") ok(standing(s.sides[other(s.over as Side)]) === 0, "a knockout win means the loser has no cards");
    const again = replayBattle(setup, log);
    if (again && JSON.stringify(again) === JSON.stringify(s)) replayed++;
  }
  ok(ended === 1000, `every battle ends (${ended})`);
  ok(replayed === 1000, `every battle replays the same (${replayed})`);
  ok(knockouts > 800, `most end on knockouts (${knockouts}; ${caps} at the cap)`);
  ok(sendOuts > 0, `send-outs happen (${sendOuts})`);
}

// ─── lines read right from each side ─────────────────────────────────────────
{
  const setup = battle("lines");
  let s = startBattle(setup);
  s = applyBattle(setup, s, 0, { lead: 0 })!;
  s = applyBattle(setup, s, 1, { lead: 0 })!;
  const first = setup.first;
  const v = battleView(setup, s, first);
  const vo = battleView(setup, s, other(first));
  const mineOut = v.log.find((l) => l.kind === "out" && l.side === "you");
  const theirOut = vo.log.find((l) => l.kind === "out" && l.side === "foe");
  ok(!!mineOut && mineOut.text.startsWith("You send out"), `your own send-out reads "You" (${mineOut?.text})`);
  ok(!!theirOut && theirOut.text.startsWith(setup.names[first]), `the other side reads their name (${theirOut?.text})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
