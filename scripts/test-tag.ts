/**
 * Tag team against a trainer (src/lib/originals/duel/tag.ts): the draft, who leads, who plays each turn, who picks
 * the next card after a knockout, the clock, and a thousand random tag duels against real Trainer Road teams that
 * must end and replay the same.
 * Run: npx tsx -r ./scripts/server-only-shim.cjs scripts/test-tag.ts
 */

import { DUEL_DATA } from "../src/lib/originals/duel/data";
import { makeSetup } from "../src/lib/originals/duel/solver";
import { actions, foeRowFor, type DuelSetup } from "../src/lib/originals/duel/engine";
import {
  TAG_MISSES_LOSE, applyTag, choicesFor, draftSize, phaseOf, replayTag, startTag, tagResult, tagTimeOut, waitingOn,
  type TagSide, type TagState, type TagStep,
} from "../src/lib/originals/duel/tag";

let pass = 0;
let fail = 0;
const ok = (cond: boolean, msg: string) => { if (cond) pass++; else { fail++; console.log("FAIL", msg); } };

let rng = 4242;
const rand = (n: number) => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng % n; };
const pool = DUEL_DATA.pool.filter((id) => DUEL_DATA.cards[id]);
const trainers = DUEL_DATA.trainers.filter((t) => ["gym", "elite", "champion"].includes(t.tier) && t.team.every((id) => DUEL_DATA.cards[id]));

function setupFor(n: number, rules: 1 | 7 = 7): DuelSetup {
  const t = trainers[rand(trainers.length)];
  const pack = Array.from({ length: 6 }, () => pool[rand(pool.length)]).filter((v, i, a) => a.indexOf(v) === i);
  while (pack.length < 6) { const id = pool[rand(pool.length)]; if (!pack.includes(id)) pack.push(id); }
  const row = foeRowFor(pack.map((id) => DUEL_DATA.cards[id]), `row${n}`);
  const s = makeSetup(DUEL_DATA.cards, t, pack, row, [], { rules, seed: `s${n}` })!;
  return { ...s, tools: 0 };
}

/** Every step the player the duel waits on could make. */
function stepsFor(setup: DuelSetup, t: TagState): { me: TagSide; st: TagStep }[] {
  const me = waitingOn(setup, t);
  if (me == null) return [];
  const ph = phaseOf(setup, t);
  if (ph === "draft") return choicesFor(setup, t, me).map((i) => ({ me, st: { pick: i } }));
  if (ph === "lead" || t.duel.you[t.duel.yi]?.out) return choicesFor(setup, t, me).map((i) => ({ me, st: { next: i } }));
  return actions(setup, t.duel).map((a) => ({ me, st: a }));
}

// ─── the draft and the lead ──────────────────────────────────────────────────
{
  const setup = setupFor(1);
  const n = draftSize(setup);
  ok(n >= 3 && n <= 6, `the draft hands out the bring count (${n})`);
  let t = startTag(setup, 1);
  ok(phaseOf(setup, t) === "draft" && waitingOn(setup, t) === 1, "the coin's player picks first");
  ok(applyTag(setup, t, 0, { pick: 0 }) === null, "the other player can't pick out of turn");
  t = applyTag(setup, t, 1, { pick: 0 })!;
  ok(waitingOn(setup, t) === 0, "then the other picks");
  ok(applyTag(setup, t, 0, { pick: 0 }) === null, "a picked card can't be picked again");
  for (let k = 1; k < n; k++) t = applyTag(setup, t, waitingOn(setup, t)!, { pick: choicesFor(setup, t, waitingOn(setup, t)!)[0] })!;
  ok(phaseOf(setup, t) === "lead" && waitingOn(setup, t) === 0, "the draft done, the second picker leads");
  const mine = t.owner.map((o, i) => (o === 0 ? i : -1)).filter((i) => i >= 0);
  const theirs = t.owner.map((o, i) => (o === 1 ? i : -1)).filter((i) => i >= 0);
  ok(Math.abs(mine.length - theirs.length) <= 1, `the cards split evenly (${mine.length} and ${theirs.length})`);
  ok(JSON.stringify(choicesFor(setup, t, 0)) === JSON.stringify(mine), "the leader picks from their own cards");
  ok(applyTag(setup, t, 0, { next: theirs[0] }) === null, "not with a partner's card");
  t = applyTag(setup, t, 0, { next: mine[0] })!;
  ok(phaseOf(setup, t) === "play" && waitingOn(setup, t) === 0, "the leader plays the first turn");
  ok(applyTag(setup, t, 1, { attach: t.duel.yi, act: { wait: true }, use: 0 }) === null, "the partner can't play a turn that isn't theirs");
}

// ─── the clock ───────────────────────────────────────────────────────────────
{
  const setup = setupFor(2);
  let t = startTag(setup, 0);
  while (phaseOf(setup, t) !== "play") t = tagTimeOut(setup, t);
  ok(phaseOf(setup, t) === "play", "timeouts finish the draft and the lead");
  let lost = false;
  for (let k = 0; k < 40 && !lost; k++) {
    const before = waitingOn(setup, t);
    t = tagTimeOut(setup, t);
    if (t.timedOut != null) { lost = true; ok(t.timedOut === before && t.missed[before!] === TAG_MISSES_LOSE, "three missed turns in a row lose"); }
  }
  ok(lost || tagResult(t) != null, "missing every turn ends the duel");
  ok(tagResult(t) === "lost", "a timed-out team loses");
}

// ─── a thousand random tag duels ─────────────────────────────────────────────
{
  let ended = 0;
  let replayed = 0;
  let wins = 0;
  let handovers = 0;
  for (let n = 0; n < 1000; n++) {
    const setup = setupFor(100 + n, n % 10 === 0 ? 1 : 7);
    const first = (n % 2) as TagSide;
    let t = startTag(setup, first);
    const log: { by: TagSide | "clock"; st?: TagStep }[] = [];
    for (let guard = 0; guard < 300 && tagResult(t) == null; guard++) {
      if (rand(25) === 0) { t = tagTimeOut(setup, t); log.push({ by: "clock" }); continue; }
      const steps = stepsFor(setup, t);
      if (!steps.length) { fail++; console.log("FAIL no step", n, phaseOf(setup, t)); break; }
      const moves = steps.filter((x) => "act" in x.st && "move" in x.st.act);
      const x = moves.length && rand(4) ? moves[rand(moves.length)] : steps[rand(steps.length)];
      const was = waitingOn(setup, t);
      const next = applyTag(setup, t, x.me, x.st);
      if (!next) { fail++; console.log("FAIL step refused", n); break; }
      log.push({ by: x.me, st: x.st });
      t = next;
      if (phaseOf(setup, t) === "play" && was != null && waitingOn(setup, t) !== was) handovers++;
    }
    const res = tagResult(t);
    if (res) ended++;
    if (res === "won") wins++;
    const again = replayTag(setup, first, log);
    if (again && JSON.stringify(again) === JSON.stringify(t)) replayed++;
  }
  ok(ended === 1000, `every tag duel ends (${ended})`);
  ok(replayed === 1000, `every tag duel replays the same (${replayed})`);
  ok(handovers > 500, `turns pass between partners (${handovers})`);
  ok(wins > 0 && wins < 1000, `some are won, some lost (${wins} won)`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
