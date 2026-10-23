/**
 * The Daily Duel's engine, solver and rules (src/lib/originals/duel/), against small fixtures
 * (scripts/duel-fixtures.ts) and, when present, the real roster for a determinism check.
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-daily-duel.ts
 */

import {
  CONDITION_RULES, actions, applyStep, begin, canUse, cloneState, damageOf, foeEnergy, foeRowFor, isLegal, nexts, pays, printedDamage, replay, roll, startState, step, swapTargets, viewOf,
  TURN_CAP, type DuelSetup, type DuelState,
} from "../src/lib/originals/duel/engine";
import { COMEBACK_MAX, FAIR_LEADS, HAND_SIZE, MIN_PLANS, WIN_BAND, adviceFor, buildDay, candidates, dayPlans, drawPack, fairLeads, hardParFor, hardSetup, hintText, makeSetup, obviousPlay, packCap, slipWinRate, solve, solverSetup } from "../src/lib/originals/duel/solver";
import { conditionsOf, plusOf, toDuelCard } from "../src/data/originals/duel/cardRules";
import { plusText } from "../src/lib/originals/duel/copy";
import {
  DUEL_EPOCH, DUEL_WARMUP, PAR_BAND, PERSON_GAP_DAYS, SCORE, duelScore, TIER_FALLBACK, TIER_LABEL, duelNumber, duelPoints, duelRand, duelShareText, duelSquares, duelTime, energyRow, eventCopy, eventPlan,
  peopleNear, peopleOf, personKey, personOf, shuffleWith, speciesOf, tierFor, trainerFor,
} from "../src/lib/originals/duel/rules";
import type { DuelCard, DuelEventAt, DuelEventKind, DuelSignature, DuelTier, DuelTrainer, EnergyType } from "../src/lib/originals/duel/types";
import { gsAddDays } from "../src/lib/time/gsClock";
import { FIX_CARDS, FIX_POOL, FIX_TRAINERS, MOCKUP_POOL } from "./duel-fixtures";
import { artCrop, trainerPicture } from "../src/lib/originals/duel/pictures";

let pass = 0;
let fail = 0;
function check(ok: unknown, what: string, detail?: unknown) {
  if (ok) pass++;
  else { fail++; console.error("FAIL:", what, detail ?? ""); }
}

// ─── tiny setups ─────────────────────────────────────────────────────────────

function card(id: string, t: EnergyType, hp: number, weak: EnergyType | null, moves: [string, EnergyType[], number][]): DuelCard {
  return { id, name: id, short: id, t, hp, weak, ex: false, img: null, moves: moves.map(([n, cost, d]) => ({ n, cost, d })) };
}
const W: EnergyType = "Water", R: EnergyType = "Fire", G: EnergyType = "Grass", F: EnergyType = "Fighting", X: EnergyType = "Colorless", M: EnergyType = "Metal", L: EnergyType = "Lightning";

/** Your six: a Water hitter, a Fire hitter, a Grass card, a Metal card, a Fighting card and a weak filler. */
const YOU = [
  card("aqua", W, 120, L, [["Splash", [W], 30], ["Wave", [W, X], 100]]),
  card("ember", R, 110, W, [["Burn", [R], 40], ["Blaze", [R, R], 90]]),
  card("leafy", G, 100, R, [["Leaf", [G], 30]]),
  card("steel", M, 140, R, [["Bash", [M, X], 60]]),
  card("rocky", F, 130, G, [["Punch", [F], 50]]),
  card("tiny", X, 60, F, [["Tap", [X], 10]]),
];
/** The trainer: a Fire card weak to Water, then a Grass card weak to Fire. */
const FOE = [
  card("blaze", R, 100, W, [["Flame", [R], 20], ["Inferno", [R, R], 80]]),
  card("vine", G, 90, R, [["Whip", [G], 30]]),
];

function mk(opts: { events?: DuelEventAt[]; row?: EnergyType[]; signature?: DuelSignature; you?: DuelCard[]; foe?: DuelCard[] } = {}): DuelSetup {
  return { you: opts.you ?? YOU, foe: opts.foe ?? FOE, row: opts.row ?? Array(TURN_CAP).fill(W), events: opts.events ?? [], signature: opts.signature ?? "energy2", trainer: "Tester" };
}
const at = (turn: number, kind: DuelEventKind): DuelEventAt => ({ turn, kind });
const TRAINER: Pick<DuelTrainer, "name" | "signature"> = { name: "Tester", signature: { title: "Tester's trick", effect: "energy2" } };

const SET = mk();
function setup1(): DuelState { return begin(SET, startState(SET), 0); }

// ─── Energy and costs ────────────────────────────────────────────────────────

check(pays([W], [W]) && !pays([R], [W]), "a colored dot needs its own type");
check(pays([R], [X]) && pays([W, R], [W, X]) && !pays([W], [W, X]), "Colorless takes any Energy that's left");
check(!pays([W, W], [W, R]) && pays([W, R, G], [R, W, X]) && !pays([W, W, R], [W, W, W]), "colored counts");
check(pays([], []) && !pays([], [X]) && pays(["Colorless"], [X]) && !pays(["Colorless"], [W]), "empty and Colorless Energy");

{
  const s = setup1();
  check(s.turn === 1 && s.pending === W && s.yi === 0, "the lead goes out and turn 1 brings the row's first Energy");
  const t = applyStep(SET, s, { attach: 3, act: { wait: true } })!;
  check(t.you[3].energy.join() === W && t.you[0].energy.length === 0, "the Energy goes on the card chosen (a waiting one too) and stays");
  check(t.turn === 2 && t.pending === W, "the next turn begins with the next Energy");
}

// ─── damage ──────────────────────────────────────────────────────────────────

{
  const s = setup1();
  check(damageOf(s, YOU[0], FOE[0], YOU[0].moves[1], true) === 200, "Weakness doubles (Water 100 into a Fire card weak to Water)");
  check(damageOf(s, YOU[2], FOE[0], YOU[2].moves[0], true) === 30, "no Weakness, printed damage");
  const rain = cloneState(s); rain.fx.weather = "rain"; rain.fx.weatherLeft = 3;
  check(damageOf(rain, YOU[0], FOE[1], YOU[0].moves[0], true) === 60 && damageOf(rain, YOU[1], FOE[1], YOU[1].moves[0], true) === 20, "rain: Water +30, Fire -30 (then Weakness)");
  const sun = cloneState(s); sun.fx.weather = "sun"; sun.fx.weatherLeft = 3;
  check(damageOf(sun, YOU[1], FOE[0], YOU[1].moves[0], true) === 70 && damageOf(sun, YOU[0], FOE[1], YOU[0].moves[0], true) === 0, "sun: Fire +30, Water -30 (never below 0)");
  const crit = cloneState(s); crit.fx.crit = true;
  check(damageOf(crit, YOU[2], FOE[0], YOU[2].moves[0], true) === 50 && damageOf(crit, YOU[4], FOE[0], YOU[4].moves[0], true) === 80, "a critical hit is half again, to the nearest 10");
  const conf = cloneState(s); conf.fx.confused = true;
  check(damageOf(conf, YOU[0], FOE[1], YOU[0].moves[1], true) === 50 && damageOf(conf, YOU[2], FOE[0], YOU[2].moves[0], true) === 20, "confused halves, to the nearest 10");
  const boost = cloneState(s); boost.fx.boost = 30;
  check(damageOf(boost, FOE[0], YOU[3], FOE[0].moves[0], false) === 100 && damageOf(boost, YOU[2], FOE[1], YOU[2].moves[0], true) === 30, "the trainer's boost only counts for its moves (and before Weakness)");
}

// ─── the trainer ─────────────────────────────────────────────────────────────

check(foeEnergy(FOE[0], []) === R && foeEnergy(FOE[0], [R]) === R && foeEnergy(FOE[0], [R, R]) === R, "the trainer's card gets what its best move needs, else its own type");
check(foeEnergy(card("x", G, 50, null, [["A", [W, X, X], 90]]), [W]) === G, "only Colorless missing: its own type");
{
  // Turn 1: blaze gets one Fire and uses Flame (20) on our lead; turn 2: a second Fire, Inferno (80).
  let s = setup1();
  s = applyStep(SET, s, { attach: 0, act: { wait: true } })!;
  check(s.you[0].cur === 100 && s.foe[0].energy.length === 1, "the trainer attaches one Energy and uses its strongest usable move");
  s = applyStep(SET, s, { attach: 0, act: { wait: true } })!;
  check(s.you[0].cur === 20, "next turn its stronger move once covered");
}

// ─── elimination, knockouts, legality ────────────────────────────────────────

{
  let s = setup1();
  s = applyStep(SET, s, { attach: 0, act: { move: 0 } })!; // Splash 30 x2 = 60 on blaze (100)
  check(s.foe[0].cur === 40, "a move does its damage");
  check(applyStep(SET, s, { attach: 1, act: { move: 1 } }) === null, "a move the Energy doesn't cover is refused");
  check(applyStep(SET, s, { next: 2 }) === null, "a card can't be sent out when none is needed");
  s = applyStep(SET, s, { attach: 0, act: { move: 1 } })!; // Wave 100 x2: blaze out, vine comes out
  check(s.foe[0].out && s.foe[0].energy.length === 0 && s.fi === 1, "a knocked-out card loses its Energy and the next in team order comes out");
  check(s.log.some((l) => l.kind === "ko") && s.log.some((l) => l.kind === "out"), "the log tells the knockout and the next card");
  s = applyStep(SET, s, { attach: 0, act: { move: 1 } })!; // Wave 100 on vine (90): won
  check(s.over === "won" && s.turn === 3, "knocking out every card wins");
  check(applyStep(SET, s, { attach: 0, act: { wait: true } }) === null, "nothing after the end");
}
{
  // Lose: a trainer that knocks out a card a turn, against six 10-HP cards.
  const weak = YOU.map((c) => ({ ...c, hp: 10 }));
  const brute = [card("brute", X, 999, null, [["Smash", [], 50]])];
  const set = mk({ you: weak, foe: brute });
  let s: DuelState | null = begin(set, startState(set), 0);
  let guard = 0;
  while (s && !s.over && guard++ < 50) {
    if (nexts(s).length && (s.yi < 0 || s.you[s.yi].out)) s = applyStep(set, s, { next: nexts(s)[0] });
    else s = applyStep(set, s, { attach: s.yi, act: { wait: true } });
  }
  check(s?.over === "lost" && s.turn === 6, "losing every card loses");
}
{
  // The turn cap: nobody can hurt anybody.
  const wall = [card("wall", X, 100, null, [["Nap", [], 0]])];
  const set = mk({ foe: wall, you: YOU.map((c) => ({ ...c, moves: [{ n: "Nap", cost: [], d: 0 }] })) });
  let s = begin(set, startState(set), 0);
  while (!s.over) s = applyStep(set, s, { attach: 0, act: { move: 0 } })!;
  check(s.over === "lost" && s.turn === TURN_CAP, "turn 40 ends it as a loss");
}
check(!isLegal(SET, startState(SET), { attach: 0, act: { wait: true } }), "no turn before the lead");

// ─── the events ──────────────────────────────────────────────────────────────

{
  const set = mk({ events: [at(1, "rain")] });
  let s = begin(set, startState(set), 0);
  check(s.fx.weather === "rain" && s.fx.weatherLeft === 3 && s.event === "rain", "rain starts for 3 turns");
  for (let i = 0; i < 3; i++) s = applyStep(set, s, { attach: 3, act: { wait: true } })!;
  check(s.fx.weather === null, "and is gone after 3 turns");
  const sun = begin(mk({ events: [at(1, "sun")] }), startState(SET), 0);
  check(sun.fx.weather === "sun", "the sunlight turns harsh");
}
{
  // Sand: field cards that aren't Fighting or Metal take 10 at the end of each turn, never a knockout.
  const set = mk({ events: [at(1, "sand")], foe: [card("sandy", G, 15, null, [["Poke", [X, X, X, X], 10]])] });
  let s = begin(set, startState(set), 4); // rocky (Fighting) leads
  s = applyStep(set, s, { attach: 4, act: { wait: true } })!;
  check(s.you[4].cur === 130 && s.foe[0].cur === 10, "sand skips Fighting cards and hits the others for 10");
  s = applyStep(set, s, { attach: 4, act: { wait: true } })!;
  check(s.foe[0].cur === 10 && !s.foe[0].out, "sand never knocks a card out");
  const set2 = mk({ events: [at(1, "sand")] });
  let s2 = begin(set2, startState(set2), 0);
  s2 = applyStep(set2, s2, { attach: 0, act: { wait: true } })!;
  check(s2.you[0].cur === 120 - 20 - 10, "sand hits your card on the field too");
}
{
  const napper = [card("napper", X, 300, null, [["Nap", [], 0]])];
  const set = mk({ events: [at(2, "rocket")], foe: napper });
  let s = begin(set, startState(set), 0);
  s = applyStep(set, s, { attach: 4, act: { wait: true } })!;
  check(s.fx.rocket === 4 && s.fx.rocketLeft === 2, "Team Rocket grabs the waiting card with the most Energy");
  check(!swapTargets(s).includes(4) && applyStep(set, s, { attach: 0, act: { swap: 4 } }) === null, "you can't swap to it");
  s = applyStep(set, s, { attach: 0, act: { wait: true } })!;
  check(s.fx.rocket === 4, "still gone the turn after");
  s = applyStep(set, s, { attach: 0, act: { wait: true } })!;
  check(s.fx.rocket === -1 && swapTargets(s).includes(4), "and back after 2 turns");
}
{
  const set = mk({ events: [at(2, "joy"), at(3, "potion")] });
  let s = begin(set, startState(set), 0);
  s = applyStep(set, s, { attach: 0, act: { wait: true } })!; // took 20, joy heals 50 (capped)
  check(s.you[0].cur === 120, "Nurse Joy heals 50, never past full HP");
  s = applyStep(set, s, { attach: 0, act: { wait: true } })!; // took 80 (Inferno), potion +30
  check(s.you[0].cur === 120 - 80 + 30, "a Potion heals 30");
}
{
  const set = mk({ events: [at(1, "wild")] });
  const s = begin(set, startState(set), 5);
  check(s.you[5].cur === 40 && s.foe[0].cur === 80, "a wild Pokémon hits both cards on the field for 20");
  const set2 = mk({ events: [at(1, "wild")], you: YOU.map((c, i) => (i === 5 ? { ...c, hp: 20 } : c)) });
  check(begin(set2, startState(set2), 5).you[5].cur === 10, "never a knockout");
}
{
  const set = mk({ events: [at(1, "sleep")] });
  let s = begin(set, startState(set), 0);
  s = applyStep(set, s, { attach: 0, act: { wait: true } })!;
  check(s.you[0].cur === 120 && s.foe[0].energy.length === 1 && s.log.some((l) => l.kind === "skip"), "asleep: the trainer's card skips its next move (it still gets its Energy)");
  s = applyStep(set, s, { attach: 0, act: { wait: true } })!;
  check(s.you[0].cur < 120, "and moves again after");
}
{
  const set = mk({ events: [at(1, "confused")], row: Array(TURN_CAP).fill(G) });
  let s = begin(set, startState(set), 2); // leafy: Leaf 30 into blaze
  s = applyStep(set, s, { attach: 2, act: { wait: true } })!;
  check(s.fx.confused, "confusion waits for your next move");
  s = applyStep(set, s, { attach: 2, act: { move: 0 } })!;
  check(s.foe[0].cur === 100 - 20 && !s.fx.confused, "your next move does half, then it's gone");
}
{
  const set = mk({ events: [at(1, "crit")], row: Array(TURN_CAP).fill(F) });
  let s = begin(set, startState(set), 4);
  s = applyStep(set, s, { attach: 4, act: { move: 0 } })!;
  check(s.foe[0].cur === 100 - 80 && !s.fx.crit, "a critical hit: half again as much, once");
}
{
  // Stubborn ace: whichever card on the field has more HP skips its next move; the trainer's on a tie.
  const set = mk({ events: [at(1, "ace")] });
  const you = begin(set, startState(set), 0); // aqua 120 vs blaze 100
  check(you.fx.aceYou && !isLegal(set, you, { attach: 0, act: { move: 0 } }) && isLegal(set, you, { attach: 0, act: { swap: 1 } }), "your card with more HP can't use a move this turn");
  check(isLegal(SET, setup1(), { attach: 0, act: { move: 0 } }), "(the same move is fine without the event)");
  const foe = begin(set, startState(set), 5); // tiny 60 vs blaze 100
  check(foe.fx.aceFoe === 0, "the trainer's card with more HP skips");
  const after = applyStep(set, foe, { attach: 5, act: { wait: true } })!;
  check(after.you[5].cur === 60, "and it does skip its move");
  const tie = mk({ events: [at(1, "ace")], foe: [card("even", R, 120, W, [["Hit", [R], 10]])] });
  check(begin(tie, startState(tie), 0).fx.aceFoe === 0, "a tie goes to the trainer's card");
}
{
  const set = mk({ events: [at(1, "advice")] });
  const s = begin(set, startState(set), 0);
  check(viewOf(set, s, TRAINER).hint === null, "the engine leaves Professor's advice to the server");
  const h = adviceFor(set, s);
  check(!!h && isLegal(set, s, { attach: h.attach, act: h.act }), "Professor's advice is a legal play for this turn");
  check(!!h && h.text.endsWith(".") && /^(Use|Swap in|Wait|Put the Energy on) /.test(h.text), "and says it in one sentence", h?.text);
  const t = hintText(set, s, { attach: 0, act: { move: 0 } });
  check(/^Use \S.*: \d+ to /.test(t), "a move names the move and its damage", t);
  const t2 = hintText(set, s, { attach: 1, act: { move: 0 } });
  check(t2.startsWith(`Put the Energy on ${set.you[1].short}, then use `), "Energy on a waiting card comes first", t2);
  const s2 = applyStep(set, s, { attach: 0, act: { wait: true } })!;
  check(adviceFor(set, { ...s2, over: "lost" }) === null, "no advice once the duel is over");
}
{
  const set = mk({ events: [at(3, "revive")] });
  let s = begin(set, startState(set), 5);
  s = applyStep(set, s, { attach: 5, act: { wait: true } })!; // tiny takes 20
  s = applyStep(set, s, { attach: 5, act: { wait: true } })!; // Inferno 80: tiny (40) is knocked out
  check(s.you[5].out && nexts(s).length === 5, "a knocked-out card needs a replacement");
  s = applyStep(set, s, { next: 3 })!;
  check(!s.you[5].out && s.you[5].cur === 30 && s.you[5].energy.length === 0 && s.yi === 3, "a Revive brings it back waiting, with half its HP and no Energy");
}
{
  const e2 = begin(mk({ events: [at(1, "signature")], signature: "energy2" }), startState(SET), 0);
  check(e2.foe[0].energy.length === 2, "signature energy2: the trainer's card gets 2 Energy");
  const hurt = mk({ events: [at(2, "signature")], signature: "heal50" });
  let h = begin(hurt, startState(hurt), 0);
  h = applyStep(hurt, h, { attach: 0, act: { move: 0 } })!; // 60 on blaze
  check(h.foe[0].cur === 90, "signature heal50: heals 50 (capped at full)");
  const boost = mk({ events: [at(1, "signature")], signature: "boost30" });
  let b = begin(boost, startState(boost), 4);
  b = applyStep(boost, b, { attach: 4, act: { wait: true } })!;
  check(b.you[4].cur === 130 - 50 && b.fx.boost === 0, "signature boost30: its next move does 30 more, once");
}

// ─── the view hides the future ───────────────────────────────────────────────

{
  const row: EnergyType[] = Array.from({ length: TURN_CAP }, (_, i) => (["Water", "Fire", "Grass", "Metal", "Fighting"] as EnergyType[])[i % 5]);
  const set = mk({ row, events: [at(1, "crit"), at(2, "sun"), at(5, "revive"), at(9, "wild")] });
  const start = startState(set);
  const v0 = viewOf(set, start, TRAINER);
  check(v0.needsNext && v0.nexts.length === 6 && v0.energy.now === null && v0.energy.next.join() === "Water,Fire,Grass", "before the lead: pick one, and the first 3 Energy");
  check(v0.forecast?.kind === "crit" && v0.event === null, "the forecast is the next turn's event");
  const s1 = begin(set, start, 0);
  const v1 = viewOf(set, s1, TRAINER);
  check(v1.energy.now === "Water" && v1.energy.next.join() === "Fire,Grass,Metal", "this turn's Energy and the next 3");
  check(v1.event?.kind === "crit" && v1.forecast?.kind === "sun", "this turn's event and the next one");
  const json = JSON.stringify(v1);
  check(!/revive|"wild"|Revive|wild Pok/.test(json), "no later events in the view");
  check(!("row" in v1) && !("events" in v1) && !json.includes("\"line\""), "the view carries no row, events or line");
  const s2 = applyStep(set, s1, { attach: 0, act: { wait: true } })!;
  const v2 = viewOf(set, s2, TRAINER);
  check(v2.forecast === null && v2.event?.kind === "sun", "no forecast when the next turn has no event");
  check(v1.you[0].moves[0].readyWithNew && !v1.you[0].moves[0].ready && v1.attachTo.length === 6 && v1.canMove, "move readiness with this turn's Energy");
  check(v1.foe[0].moves[1].damage === 80 && v1.you[0].moves[1].weak, "damage and Weakness against the card across");
  check(eventCopy("signature", TRAINER).title === "Tester's trick" && eventCopy("sleep", TRAINER).title.includes("Tester"), "event words name the trainer");
}

// ─── the solver ──────────────────────────────────────────────────────────────

{
  const cyn = FIX_TRAINERS.find((t) => t.id === "cynthia-platinum")!;
  const pack = ["rsv10pt5-167", "me1-135", "svp-122", "sv9-73", "rsv10pt5-20", "sv4-248"];
  const types = [...new Set(pack.map((id) => FIX_CARDS[id].t).filter((t) => t !== "Colorless"))];
  const row: EnergyType[] = [];
  let x = 7;
  for (let i = 0; i < TURN_CAP; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; row.push(types[x % types.length]); }
  const events: DuelEventAt[] = [at(2, "rain"), at(4, "rocket"), at(6, "signature"), at(8, "joy"), at(10, "sleep"), at(12, "crit"), at(14, "wild"), at(16, "potion")];
  const set = makeSetup(FIX_CARDS, cyn, pack, row, events)!;
  const t0 = Date.now();
  const sol = solve(set);
  const ms = Date.now() - t0;
  check(sol && sol.par >= 8 && sol.par <= 20, `the solver beats Cynthia with the mockup's pack (par ${sol?.par}, ${ms}ms)`);
  const end = sol ? replay(set, sol.line) : null;
  check(end?.over === "won" && end.turn === sol?.par, "its line replays to a win in par turns");
  check(!obviousPlay(set).won, "and the obvious play loses it");
  check(JSON.stringify(solve(set)) === JSON.stringify(sol), "the solver is deterministic");
  check(ms < 3000, `one solve stays fast (${ms}ms)`);
}

// ─── building a day ──────────────────────────────────────────────────────────

{
  const day = "2026-11-01"; // a Sunday: champion
  const a = buildDay(day, FIX_POOL, FIX_CARDS, FIX_TRAINERS, "", { budgetMs: 120_000 });
  const b = buildDay(day, FIX_POOL, FIX_CARDS, FIX_TRAINERS, "", { budgetMs: 120_000 });
  check(!!a && a.tier === "champion" && a.trainerId === "cynthia-platinum", "Sunday is a champion's day");
  const strip = (x: typeof a) => x && { ...x, ms: 0 };
  check(JSON.stringify(strip(a)) === JSON.stringify(strip(b)), "the same day builds the same duel");
  if (a) {
    const tr = FIX_TRAINERS.find((t) => t.id === a.trainerId)!;
    const set = makeSetup(FIX_CARDS, tr, a.pack, a.row, a.events)!;
    check(replay(set, a.line)?.over === "won", "a built day's line wins");
    check(!obviousPlay(set).won, "a built day beats the obvious play");
    check(new Set(a.pack.map((id) => speciesOf(FIX_CARDS[id]))).size === 6 && a.pack.filter((id) => FIX_CARDS[id].ex).length <= 2, "six species, at most 2 ex");
    check(!a.inBand || (a.par >= PAR_BAND.champion[0] && a.par <= PAR_BAND.champion[1]), "par inside the band when it says so");
  }
  const mon = buildDay("2026-11-02", FIX_POOL, FIX_CARDS, FIX_TRAINERS, "", { budgetMs: 60_000 });
  check(!!mon && mon.tier === "gym", "Monday is a gym day");
}
{
  // Packs: strength matched, constraints held.
  const light = [card("l1", L, 60, F, [["Zap", [L], 30]]), card("l2", L, 90, F, [["Bolt", [L, X], 60]])];
  const cap = packCap(light, 20);
  check(cap.damage === 80 && cap.hp === 110, "the cap is the team's hardest hit and biggest card plus the slack");
  const ids = candidates(FIX_POOL, FIX_CARDS, new Set(), cap);
  check(ids.every((id) => FIX_CARDS[id].hp <= 110 && FIX_CARDS[id].moves.every((m) => m.d <= 80)), "candidates stay under the cap");
  let ok = true;
  for (let i = 0; i < 30; i++) {
    const p = drawPack(FIX_POOL, FIX_CARDS, duelRand(`pack:${i}`), 1);
    if (!p) { ok = false; break; }
    const types = new Set(p.map((id) => FIX_CARDS[id].t));
    if (p.length !== 6 || new Set(p.map((id) => speciesOf(FIX_CARDS[id]))).size !== 6 || p.filter((id) => FIX_CARDS[id].ex).length > 1 || types.size < 3) ok = false;
  }
  check(ok, "30 packs: six species, the ex limit, 3 types");
  check(speciesOf({ name: "Cynthia's Garchomp ex", short: "Garchomp ex" }) === "garchomp" && speciesOf({ name: "Mega Lucario ex", short: "Mega Lucario ex" }) === "lucario", "species from the name");
  check(MOCKUP_POOL.length === 8, "fixtures load");
}

// ─── the row, the events, the calendar ───────────────────────────────────────

{
  const pack = [YOU[0], YOU[1], YOU[2], YOU[5]];
  const row = energyRow(pack, duelRand("row"));
  check(row.length === TURN_CAP && row.every((t) => ([W, R, G] as EnergyType[]).includes(t)), "the row only holds the colored types the pack's moves ask for");
  check(JSON.stringify(energyRow(pack, duelRand("row"))) === JSON.stringify(row), "the row is seeded");
  let good = true;
  for (let i = 0; i < 200; i++) {
    const ev = eventPlan(duelRand(`ev:${i}`));
    const sig = ev.findIndex((e) => e.kind === "signature");
    const rev = ev.findIndex((e) => e.kind === "revive");
    if (ev[0].turn < 2 || ev[0].turn > 3 || sig < 1 || sig > 2 || (rev >= 0 && rev < 2) || ev.filter((e) => e.kind === "signature").length !== 1) good = false;
    for (let j = 1; j < ev.length; j++) if (ev[j].turn - ev[j - 1].turn < 2 || ev[j].turn - ev[j - 1].turn > 4 || ev[j].kind === ev[j - 1].kind) good = false;
    if (new Set(ev.slice(0, 14).map((e) => e.kind)).size !== Math.min(14, ev.length)) good = false;
  }
  check(good, "events: first on turn 2-3, every 2-4 turns, the signature 2nd or 3rd, Revive never before the 3rd, no repeats in a deck");
}
{
  const tiers = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"].map(tierFor);
  check(tiers.join() === "champion,gym,gym,elite,elite,rival,boss", "tiers by weekday");
  check(["2026-10-31", "2026-11-07", "2026-11-14", "2027-03-13"].every((d) => tierFor(d) === "boss"), "every Saturday is Boss day");
  check(TIER_LABEL.boss === "Boss" && PAR_BAND.boss[0] > PAR_BAND.rival[0] && PAR_BAND.boss[1] < PAR_BAND.champion[1], "the boss band sits between rival and champion");
  check(duelNumber(DUEL_EPOCH) === 1 && duelNumber(gsAddDays(DUEL_EPOCH, 6)) === 7 && duelNumber("2026-10-01") === 0, "duel numbers");
  check(duelNumber("2026-11-02") === 11 && duelNumber("2026-10-22") === 0, "duel numbers across the clock change; the warm-up is 0");
  // Rotation: within a tier, no trainer twice until all have had a day.
  const roster = ["a", "b", "c", "d"].map((id): DuelTrainer => ({ id, name: id, title: "", game: "", tier: "gym", team: [], signature: { title: "", effect: "heal50" } }));
  const seen: string[] = [];
  // From the rotation's anchor Monday (2026-01-05), so the cycles line up with the slices.
  for (let d = "2026-01-05"; seen.length < 12; d = gsAddDays(d, 1)) if (tierFor(d) === "gym") seen.push(trainerFor(d, roster)!.id);
  const cycles = [seen.slice(0, 4), seen.slice(4, 8), seen.slice(8, 12)];
  check(cycles.every((c) => new Set(c).size === 4), "a tier's trainers rotate without repeats until all have had a day");
  check(seen.every((x, i) => i === 0 || x !== seen[i - 1]), "never the same trainer twice in a row");
  const elites = FIX_TRAINERS.filter((t) => t.tier !== "elite");
  check(trainerFor("2026-11-04", elites) !== null, "a tier with no trainers falls back to the nearest");
  check(FIX_TRAINERS.every((t) => t.tier !== "boss") && trainerFor("2026-11-07", FIX_TRAINERS)?.tier === "champion", "with no bosses yet, Saturday falls back to a champion");
  check(trainerFor("2026-11-07", []) === null, "no trainers, no trainer");
}

// ─── people and their teams ──────────────────────────────────────────────────

{
  check(personKey("Lt. Surge") === "lt-surge" && personKey("Tate & Liza") === "tate-liza" && personKey("Professor Kukui") === "professor-kukui", "person keys from names");
  check(personOf({ name: "Cynthia" }) === "cynthia" && personOf({ name: "Cynthia", person: "cynthia-x" }) === "cynthia-x", "a person key from the roster wins over the name");
  const sig = { title: "", effect: "heal50" as const };
  const t = (id: string, name: string, person?: string): DuelTrainer => ({ id, person, name, title: "", game: "", tier: "boss", team: [], signature: sig });
  // Ann has three teams, Bob two, Cy one; the order teams appear in is the order they come out.
  const roster = [t("ann-one", "Ann"), t("bob-one", "Bob"), t("cy-one", "Cy"), t("ann-two", "Ann"), t("bob-two", "Bob"), t("ann-three", "Ann")];
  check(peopleOf(roster).map((p) => `${p.person}:${p.teams.map((x) => x.id).join("+")}`).join() === "ann:ann-one+ann-two+ann-three,bob:bob-one+bob-two,cy:cy-one", "people with their teams in roster order");
  const sats: DuelTrainer[] = [];
  for (let d = "2026-01-05"; sats.length < 18; d = gsAddDays(d, 1)) if (tierFor(d) === "boss") sats.push(trainerFor(d, roster)!);
  const people = sats.map((x) => personOf(x));
  let eachOnce = true;
  let teamsCycle = true;
  for (let c = 0; c < 6; c++) {
    const slice = sats.slice(c * 3, c * 3 + 3);
    if (new Set(slice.map((x) => personOf(x))).size !== 3) eachOnce = false;
    for (const x of slice) {
      const want = { ann: ["ann-one", "ann-two", "ann-three"], bob: ["bob-one", "bob-two"], cy: ["cy-one"] }[personOf(x) as "ann" | "bob" | "cy"];
      if (x.id !== want[c % want.length]) teamsCycle = false;
    }
  }
  check(eachOnce, "the rotation goes by person: three people, each once per cycle (six teams don't make six slots)");
  check(teamsCycle, "a person brings their next team each time they come back (team c % teams on cycle c)");
  check(people.every((x, i) => i === 0 || x !== people[i - 1]), "never the same person twice in a row, across cycles too");
  check(new Set(sats.map((x) => x.id)).size === 6, "every team gets its days");
  const single = [t("ann-one", "Ann"), t("bob-one", "Bob"), t("cy-one", "Cy")];
  const once: string[] = [];
  for (let d = "2026-01-05"; once.length < 9; d = gsAddDays(d, 1)) if (tierFor(d) === "boss") once.push(trainerFor(d, single)!.id);
  check([0, 3, 6].every((i) => new Set(once.slice(i, i + 3)).size === 3), "one team each rotates as before");
  // The same person in two tiers rotates in each tier on its own.
  const both = [...single, { ...t("ann-gym", "Ann"), tier: "gym" as const }];
  check(trainerFor("2026-11-02", both)?.id === "ann-gym" && trainerFor("2026-11-07", both)?.tier === "boss", "a person's team in another tier only shows on that tier's days");
}

// ─── the week guard: nobody twice inside a week, whatever the tiers ──────────

/** The rotation before the week guard (pass 1), for the "nobody held back" check. */
function plainTrainerFor(day: string, trainers: readonly DuelTrainer[]): DuelTrainer | null {
  const want = tierFor(day);
  const order: DuelTier[] = [want, ...TIER_FALLBACK[want]];
  const tier = order.find((x) => trainers.some((t) => t.tier === x));
  if (!tier) return null;
  const people = peopleOf(trainers.filter((t) => t.tier === tier));
  const keys = people.map((p) => p.person);
  const n = keys.length;
  let k = 0;
  for (let d = "2026-01-05"; d < day; d = gsAddDays(d, 1)) if (tierFor(d) === want) k++;
  const cycle = Math.floor(k / n);
  let prevLast: string | null = null;
  let seq: string[] = keys;
  for (let c = 0; c <= cycle; c++) {
    seq = shuffleWith(keys, duelRand(`duel-people:${tier}:${c}`));
    if (n > 1 && prevLast && seq[0] === prevLast) [seq[0], seq[1]] = [seq[1], seq[0]];
    prevLast = seq[n - 1];
  }
  const teams = people.find((p) => p.person === seq[k % n])!.teams;
  return teams[cycle % teams.length];
}

/**
 * Walks `days` days from the anchor and checks the guard and the fairness rules: nobody inside
 * PERSON_GAP_DAYS of themselves in any tier, never twice in a row in a tier, each person's c-th
 * visit in a tier brings team c % teams, everyone in a tier gets a first visit inside its first
 * cycle plus a week of tier days, visit counts in a tier never drift more than 2 apart, and no gap
 * between a person's visits longer than two cycles and a week.
 */
function guardWalk(trainers: readonly DuelTrainer[], days: number, from = "2026-01-05") {
  const out = { clashes: [] as string[], inARow: 0, wrongTeam: 0, drift: 0, firstLate: 0, longGap: 0, picks: [] as { day: string; tier: DuelTier; t: DuelTrainer }[] };
  for (let i = 0; i < days; i++) {
    const day = gsAddDays(from, i);
    const t = trainerFor(day, trainers);
    if (!t) continue;
    out.picks.push({ day, tier: tierFor(day), t });
  }
  for (let i = 0; i < out.picks.length; i++) {
    for (let j = i + 1; j < out.picks.length && j - i < PERSON_GAP_DAYS; j++) {
      if (personOf(out.picks[i].t) === personOf(out.picks[j].t)) out.clashes.push(`${out.picks[i].day}/${out.picks[j].day} ${personOf(out.picks[i].t)}`);
    }
  }
  for (const tier of ["gym", "elite", "rival", "boss", "champion"] as DuelTier[]) {
    const people = peopleOf(trainers.filter((t) => t.tier === tier));
    if (!people.length) continue;
    const teamsOf = new Map(people.map((p) => [p.person, p.teams]));
    const n = people.length;
    const visits = new Map(people.map((p) => [p.person, 0]));
    const lastAt = new Map<string, number>();
    const mine = out.picks.filter((p) => p.tier === tier && p.t.tier === tier);
    mine.forEach((p, k) => {
      const who = personOf(p.t);
      if (k > 0 && personOf(mine[k - 1].t) === who) out.inARow++;
      const c = visits.get(who)!;
      const teams = teamsOf.get(who)!;
      if (teams[c % teams.length].id !== p.t.id) out.wrongTeam++;
      visits.set(who, c + 1);
      const counts = [...visits.values()];
      if (k >= n + PERSON_GAP_DAYS && Math.max(...counts) - Math.min(...counts) > 2) out.drift++;
      if (lastAt.has(who) && k - lastAt.get(who)! > 2 * n + PERSON_GAP_DAYS) out.longGap++;
      lastAt.set(who, k);
      if (k === n + PERSON_GAP_DAYS - 1 && counts.some((x) => x === 0)) out.firstLate++;
    });
  }
  return out;
}

{
  const sig = { title: "", effect: "heal50" as const };
  const tr = (id: string, name: string, tier: DuelTier): DuelTrainer => ({ id, name, title: "", game: "", tier, team: [], signature: sig });
  const roster: DuelTrainer[] = [];
  const tiers: DuelTier[] = ["gym", "elite", "rival", "boss", "champion"];
  tiers.forEach((tier, ti) => { for (let i = 0; i < [14, 10, 9, 9, 9][ti]; i++) roster.push(tr(`${tier}${i}-a`, `${tier} ${i}`, tier)); });
  // Combos: second and third teams, added after the first ones.
  roster.push(tr("gym0-b", "gym 0", "gym"), tr("gym0-c", "gym 0", "gym"), tr("elite1-b", "elite 1", "elite"), tr("boss2-b", "boss 2", "boss"), tr("champion3-b", "champion 3", "champion"));
  // People in more than one tier: Ann (gym, boss), Bob (elite, champion), Cy (rival, gym, champion, with two gym teams), Dee (gym, elite).
  roster.push(tr("ann-gym", "Ann", "gym"), tr("ann-boss", "Ann", "boss"), tr("bob-elite", "Bob", "elite"), tr("bob-champ", "Bob", "champion"),
    tr("cy-rival", "Cy", "rival"), tr("cy-gym", "Cy", "gym"), tr("cy-champ", "Cy", "champion"), tr("cy-gym-2", "Cy", "gym"), tr("dee-gym", "Dee", "gym"), tr("dee-elite", "Dee", "elite"));
  const w = guardWalk(roster, 1100);
  check(w.clashes.length === 0, `the week guard: nobody twice inside ${PERSON_GAP_DAYS} days over three years, people in two or three tiers included (${w.clashes.slice(0, 3).join("; ") || "none"})`);
  check(w.inARow === 0, "the guard: never the same person twice in a row in a tier");
  check(w.wrongTeam === 0, "the guard: a person's c-th visit in a tier brings team c % teams (combos return in turn)");
  check(w.firstLate === 0 && w.longGap === 0 && w.drift === 0, `the guard keeps each tier fair (late first visits ${w.firstLate}, long gaps ${w.longGap}, drift ${w.drift})`);
  const cyGym = w.picks.filter((p) => personOf(p.t) === "cy" && p.tier === "gym").map((p) => p.t.id);
  check(cyGym.length >= 4 && cyGym.slice(0, 4).join() === "cy-gym,cy-gym-2,cy-gym,cy-gym-2", `a person in three tiers still walks their gym teams in turn (${cyGym.slice(0, 4).join(", ")})`);
  // With nobody in two tiers, nobody is ever held back: the guarded rotation is the plain one.
  const plain = roster.filter((t) => !["Ann", "Bob", "Cy", "Dee"].includes(t.name));
  let same = true;
  for (let i = 0; i < 400; i++) { const d = gsAddDays("2026-01-05", i); if (trainerFor(d, plain)?.id !== plainTrainerFor(d, plain)?.id) same = false; }
  check(same, "with nobody held back, the guarded rotation matches the plain one day for day");
  const pw = guardWalk(plain, 400);
  check(pw.clashes.length === 0 && pw.wrongTeam === 0, "and the plain roster never clashes");
  // The guard moves only some days: the rest of the mixed roster's calendar is the plain rotation.
  let moved = 0;
  for (let i = 0; i < 400; i++) { const d = gsAddDays("2026-01-05", i); if (trainerFor(d, roster)?.id !== plainTrainerFor(d, roster)?.id) moved++; }
  check(moved > 0 && moved < 120, `the guard moves only some days (${moved} of 400 in a roster with four people across tiers)`);
  // Stand-ins: peopleNear lists everyone on the days around a day.
  const near = peopleNear("2026-11-04", roster);
  let nearOk = true;
  for (let k = 1; k < PERSON_GAP_DAYS; k++) for (const d of [gsAddDays("2026-11-04", -k), gsAddDays("2026-11-04", k)]) if (!near.has(personOf(trainerFor(d, roster)!))) nearOk = false;
  check(nearOk && !near.has(personOf(trainerFor("2026-11-04", roster)!)), "peopleNear lists the people on the days less than a week away (and not the day's own)");
  // Cheap: a fresh roster, a day five years out.
  const fresh = roster.slice();
  const t0 = Date.now();
  trainerFor("2031-01-06", fresh);
  check(Date.now() - t0 < 500, `a day five years out on a fresh roster is quick (${Date.now() - t0}ms)`);
  check(trainerFor("2025-12-29", roster) !== null, "a day before the anchor still has a trainer");
}

// ─── points and sharing ──────────────────────────────────────────────────────

check(duelPoints(true, 10, 12) === 10 && duelPoints(true, 12, 12) === 10 && duelPoints(true, 13, 12) === 8 && duelPoints(true, 14, 12) === 6 && duelPoints(true, 15, 12) === 4 && duelPoints(true, 22, 12) === 2 && duelPoints(false, 9, 12) === 0, "points from turns against par");
check(duelTime(192) === "3:12" && duelTime(59) === "0:59" && duelTime(7300) === "2h 1m", "times");
check(duelSquares([true, false, true, true, false, true]) === "🟩🟥🟩🟩🟥🟩", "squares: standing and knocked out");
{
  const text = duelShareText({ number: 4, trainer: "Cynthia", won: true, turns: 14, par: 13, seconds: 192, standing: [true, true, false, true, false, true], knocked: 6, team: 6 });
  check(text.includes("Daily Duel #4 · vs Cynthia") && text.includes("Won in 14 turns (par 13) ⏱ 3:12") && text.includes("🟩🟩🟥🟩🟥🟩") && text.endsWith("/daily-duel"), "share text");
  const names = Object.values(FIX_CARDS).map((c) => c.short);
  check(names.every((n) => !text.includes(n)), "the share text never names a card");
  const lost = duelShareText({ number: 4, trainer: "Cynthia", won: false, turns: 18, par: 13, seconds: 300, standing: [false, false, false, false, false, false], knocked: 4, team: 6, practice: true });
  check(lost.includes("Knocked out 4 of 6") && lost.includes("(practice)"), "a loss and a practice duel");
}

// ─── the trainer's picture ───────────────────────────────────────────────────

{
  // A day stored before `person` existed finds the same picture by name; a person with no card gets the ace on the day's own team.
  const withPerson = trainerPicture({ name: "Bertha", person: "bertha" }, null);
  const byName = trainerPicture({ name: "Bertha" }, null);
  check(withPerson?.kind === "card" && withPerson.id === byName?.id && withPerson.credit === byName?.credit, "a stored day without `person` gets the same picture by name");
  const ace = card("their-ace", L, 120, F, [["Zap", [L], 40]]);
  const noImg = trainerPicture({ name: "Bugsy" }, ace);
  check(noImg === null, "an ace with no image: no picture (the page falls back to the plain line)");
  const aceShown = trainerPicture({ name: "Bugsy" }, { ...ace, short: "Kakuna", img: "https://images.scrydex.com/pokemon/x-1/medium" });
  check(aceShown?.kind === "ace" && aceShown.card === "Kakuna" && aceShown.credit === "Bugsy's picture: the art from Bugsy's ace, Kakuna." && aceShown.alt === "Bugsy's ace, Kakuna, from its card", "a person with no card: their ace, labeled with their name");
  const official = trainerPicture({ name: "Wattson" }, { ...ace, short: "Manectric", img: "https://images.scrydex.com/pokemon/x-1/medium" });
  check(official?.kind === "official" && official.img === "/images/duel/trainers/wattson.webp" && official.credit === "Wattson's picture: official artwork from Pokémon Omega Ruby and Alpha Sapphire." && official.alt === "Wattson, from official artwork", "a person with no card but official artwork: the artwork, ahead of the ace");
  // The crop: a banner keeps the art window's full width or height; a closer round crop is square and centred on the face where it can be.
  if (withPerson) {
    const [, , bw, bh] = artCrop(withPerson, 16, 7);
    check(Math.abs(bw - withPerson.box[2]) < 1e-9 || Math.abs(bh - withPerson.box[3]) < 1e-9, "a banner covers with the art window's full width or height");
    const [rx, ry, rw, rh] = artCrop({ ...withPerson, face: [0.5, 0.5, 2] }, 1, 1, { zoom: 2 });
    check(Math.abs(rx + rw / 2 - (withPerson.box[0] + withPerson.box[2] / 2)) < 1e-9 && Math.abs(ry + rh / 2 - (withPerson.box[1] + withPerson.box[3] / 2)) < 1e-9, "a round crop centres on the face when the art window allows");
    const [cx] = artCrop({ ...withPerson, face: [0, 0.5, 2] }, 1, 1, { zoom: 2 });
    check(Math.abs(cx - withPerson.box[0]) < 1e-9, "a face at the edge: the crop stops at the art window's edge");
  }
}

// ─── conditions (rules 2, picks 2026-10-22) ──────────────────────────────────

{
  // The card's words: two wordings play, everything else stays out.
  const one = (t: string) => JSON.stringify(conditionsOf(t));
  check(one("Your opponent's Active Pokémon is now Paralyzed.") === '[{"c":"paralyzed"}]', "always: paralyzed");
  check(one("Flip a coin. If heads, the Defending Pokémon is now Confused.") === '[{"c":"confused","coin":true}]', "coin: confused (old wording)");
  check(one("Your opponent's Active Pokémon is now Asleep and Poisoned.") === '[{"c":"asleep"},{"c":"poisoned"}]', "two conditions");
  check(one("Discard 2 Energy attached to this Pokémon. Your opponent's Active Pokémon is now Burned.") === '[{"c":"burned"}]', "a condition after other words");
  check(one("If the Defending Pokémon is a Basic Pokémon, that Pokémon is now Asleep.") === "[]", "a condition with its own condition stays out");
  check(one("Flip a coin. If heads, the Defending Pokémon is now Paralyzed. If tails, the Defending Pokémon is now Confused.") === "[]", "heads-or-tails stays out");
  check(one("This Pokémon is now Confused.") === "[]", "the attacker's own condition stays out");
  check(one("Flip 2 coins. This attack does 20 damage for each heads. If either of them is heads, your opponent's Active Pokémon is now Paralyzed.") === "[]", "two coins stay out");
  const row = { id: "t-1", name: "Testmon", supertype: "Pokémon", subtypes: ["Basic"], types: ["Grass"], hp: "80", rarity: null, language_code: "en", images: null, weaknesses: [{ type: "Fire" }],
    attacks: [{ name: "Sting", cost: ["Grass"], damage: "20", text: "Your opponent's Active Pokémon is now Poisoned." }, { name: "Tackle", cost: ["Colorless"], damage: "10", text: "" }] };
  const tc = toDuelCard(row);
  check(tc?.moves[0].fx?.[0]?.c === "poisoned" && !tc?.moves[1].fx, "toDuelCard keeps a move's conditions");

  // The rolls: the same key gives the same chance, keys spread out.
  const V = { ...mk(), rules: 2 as const, seed: "2026-11-01" };
  check(roll(V, "a") === roll(V, "a") && roll(V, "a") !== roll({ ...V, seed: "2026-11-02" }, "a"), "rolls repeat per day and key, and change by day");
  let sum = 0;
  for (let i = 0; i < 4000; i++) { const r = roll(V, `k${i}`); sum += r; if (r < 0 || r >= 100) check(false, "roll in range"); }
  check(Math.abs(sum / 4000 - 50) < 2.5, `rolls average about 50 (${(sum / 4000).toFixed(1)})`);

  // A move with a sure condition lands about half the time; a coin about a quarter; never under rules 1 or for the solver.
  const zap = card("zap", L, 100, null, [["Zap", [X], 10]]);
  zap.moves[0].fx = [{ c: "paralyzed" }];
  const flip = card("flip", L, 100, null, [["Flip", [X], 10]]);
  flip.moves[0].fx = [{ c: "burned", coin: true }];
  const big = card("big", G, 300, null, [["Slap", [G, G, G, G], 10]]);
  const rate = (you: DuelCard, opts: { rules?: 2; luck?: "miss" }) => {
    let n = 0;
    for (let i = 0; i < 400; i++) {
      const set: DuelSetup = { ...mk({ you: [you, ...YOU.slice(1)], foe: [big] }), rules: opts.rules, seed: `d${i}`, luck: opts.luck };
      const s = step(set, begin(set, startState(set), 0), { attach: 0, act: { move: 0 } });
      if (s.foe[0].cond) n++;
    }
    return n / 400;
  };
  const sure = rate(zap, { rules: 2 });
  const coin = rate(flip, { rules: 2 });
  check(sure > 0.42 && sure < 0.58, `a sure condition lands about half the time (${sure})`);
  check(coin > 0.18 && coin < 0.32, `a coin condition lands about a quarter of the time (${coin})`);
  check(rate(zap, {}) === 0, "rules 1 never plays conditions");
  check(rate(zap, { rules: 2, luck: "miss" }) === 0, "the solver's luck: your conditions never land");

  // Burned and Poisoned at the end of the turn; Poisoned grows.
  const V2: DuelSetup = { ...mk({ foe: [big] }), rules: 2, seed: "t" };
  let s = begin(V2, startState(V2), 0);
  s.foe[0].cond = { k: "burned", n: 0 };
  let t = step(V2, s, { attach: 0, act: { wait: true } });
  check(t.foe[0].cur === 300 - CONDITION_RULES.burn && t.log.some((l) => l.kind === "tick" && l.cond === "burned"), "Burned takes 20 at the end of the turn");
  s = begin(V2, startState(V2), 0);
  s.foe[0].cond = { k: "poisoned", n: 0 };
  t = step(V2, s, { attach: 0, act: { wait: true } });
  const t2 = step(V2, begin(V2, t, null), { attach: 0, act: { wait: true } });
  check(t.foe[0].cur === 290 && t2.foe[0].cur === 270, "Poisoned takes 10, then 20");

  // A tick can knock a card out: the trainer's next card comes out, or you've won.
  s = begin(V2, startState(V2), 0);
  s.foe[0].cond = { k: "burned", n: 0 };
  s.foe[0].cur = 10;
  t = step(V2, s, { attach: 0, act: { wait: true } });
  check(t.over === "won", "a burn that knocks out the last card wins");
  const two: DuelSetup = { ...mk({ foe: [big, FOE[1]] }), rules: 2, seed: "t" };
  s = begin(two, startState(two), 0);
  s.foe[0].cond = { k: "poisoned", n: 0 };
  s.foe[0].cur = 10;
  t = step(two, s, { attach: 0, act: { wait: true } });
  check(t.foe[0].out && t.fi === 1 && !t.over && t.log.some((l) => l.kind === "out" && l.side === "foe"), "poison knocks out a card and the next one comes out");

  // Asleep: no moves, counts down on its turns, wakes. Swapping out cures it.
  s = begin(V2, startState(V2), 0);
  s.you[0].cond = { k: "asleep", n: 2 };
  check(!canUse(V2, s, 0, 0) && !actions(V2, s).some((a) => "move" in a.act), "an Asleep card has no moves");
  check(!viewOf(V2, s, TRAINER).canMove && viewOf(V2, s, TRAINER).you[0].cond === "asleep", "the view says it can't move");
  t = step(V2, s, { attach: 0, act: { wait: true } });
  check(t.you[0].cond?.n === 1 && t.log.some((l) => l.kind === "skip" && l.why === "asleep" && l.side === "you"), "Asleep counts down when it waits");
  const t3 = step(V2, begin(V2, t, null), { attach: 0, act: { wait: true } });
  check(!t3.you[0].cond && t3.log.some((l) => l.kind === "wake" && l.side === "you"), "it wakes when the count runs out");
  s = begin(V2, startState(V2), 0);
  s.you[0].cond = { k: "burned", n: 0 };
  s.you[0].conf = 2;
  t = step(V2, s, { attach: 0, act: { swap: 1 } });
  check(!t.you[0].cond && !t.you[0].conf && t.yi === 1, "swapping out cures every condition");

  // Paralyzed stops about a quarter of moves; Confused turns about a third on the card itself.
  let para = 0;
  let self = 0;
  let selfDamage = true;
  for (let i = 0; i < 400; i++) {
    const set: DuelSetup = { ...mk({ foe: [big] }), rules: 2, seed: `p${i}` };
    const a = begin(set, startState(set), 0);
    a.you[0].cond = { k: "paralyzed", n: 0 };
    if (step(set, a, { attach: 0, act: { move: 0 } }).log.some((l) => l.kind === "skip" && l.why === "paralyzed")) para++;
    const c = begin(set, startState(set), 0);
    c.you[0].conf = 3;
    const r = step(set, c, { attach: 0, act: { move: 0 } });
    const hitSelf = r.log.find((l) => l.kind === "self");
    if (hitSelf) { self++; if (r.you[0].cur !== YOU[0].hp - CONDITION_RULES.confusedHit) selfDamage = false; }
    if (r.you[0].conf !== 2) check(false, "Confused counts down by one on its turn");
  }
  check(para / 400 > 0.17 && para / 400 < 0.33, `Paralyzed stops about a quarter (${para / 400})`);
  check(self / 400 > 0.25 && self / 400 < 0.41 && selfDamage, `Confused hits itself about a third, for 20 (${self / 400})`);

  // One lasting condition at a time (the newest wins); Confused sits beside it.
  const both = card("both", L, 100, null, [["Mix", [X], 10]]);
  both.moves[0].fx = [{ c: "paralyzed" }, { c: "confused" }];
  let landedBoth = false;
  for (let i = 0; i < 60 && !landedBoth; i++) {
    const set: DuelSetup = { ...mk({ you: [both, ...YOU.slice(1)], foe: [big] }), rules: 2, seed: `b${i}` };
    const a = begin(set, startState(set), 0);
    a.foe[0].cond = { k: "burned", n: 0 };
    const r = step(set, a, { attach: 0, act: { move: 0 } });
    if (r.foe[0].cond?.k === "paralyzed" && r.foe[0].conf) landedBoth = r.log.filter((l) => l.kind === "cond").length === 2;
  }
  check(landedBoth, "a new lasting condition replaces the old one, and Confused sits beside it");

  // The two events that became conditions.
  const ev: DuelSetup = { ...mk({ events: [at(1, "sleep")], foe: [big] }), rules: 2, seed: "e" };
  const se = begin(ev, startState(ev), 0);
  check(se.foe[0].cond?.k === "asleep" && se.foe[0].cond.n >= 1 && se.foe[0].cond.n <= 3 && se.fx.sleep === -1, "the sleep event puts the trainer's card to sleep for 1 to 3 turns");
  const ec: DuelSetup = { ...mk({ events: [at(1, "confused")] }), rules: 2, seed: "e" };
  const ce = begin(ec, startState(ec), 0);
  check(ce.you[0].conf === CONDITION_RULES.confusedTurns && !ce.fx.confused, "the confused event makes your card Confused for 3 turns");
  check(eventCopy("sleep", TRAINER, 2).text.includes("1 to 3") && !eventCopy("sleep", TRAINER).text.includes("1 to 3"), "rules 2 has its own event words");

  // The view shows a move's chance only under rules 2.
  const vz: DuelSetup = { ...mk({ you: [zap, ...YOU.slice(1)] }), rules: 2, seed: "v" };
  check(viewOf(vz, startState(vz), TRAINER).you[0].moves[0].fx[0]?.chance === CONDITION_RULES.sure, "the view shows a sure condition at 50%");
  check(viewOf({ ...vz, rules: undefined }, startState(vz), TRAINER).you[0].moves[0].fx.length === 0, "rules 1 shows no chances");
  check(viewOf({ ...mk({ you: [flip, ...YOU.slice(1)] }), rules: 2, seed: "v" }, startState(vz), TRAINER).you[0].moves[0].fx[0]?.chance === CONDITION_RULES.coin, "a coin condition shows at 25%");

  // The solver plays rules 2 with your luck missing, and its line still replays.
  check(solverSetup(V2).luck === "miss" && solverSetup(mk()).luck === undefined, "solverSetup only changes rules 2 setups");
  const fixV2 = makeSetup(FIX_CARDS, FIX_TRAINERS[0], FIX_POOL.slice(0, 6), Array(TURN_CAP).fill("Colorless"), [], { rules: 2, seed: "x" });
  check(!!fixV2 && fixV2.rules === 2 && fixV2.seed === "x", "makeSetup sets the rules and the day");
  const solV2 = fixV2 && solve(solverSetup(fixV2), { width: 60 });
  if (solV2) check(replay(solverSetup(fixV2!), solV2.line)?.over === "won", "a rules 2 line replays to a win");

  // Rules 3: every six holds a card with a condition move (when the candidates have one).
  const fxIds = ["fx1", "fx2"];
  const pool: Record<string, DuelCard> = {};
  const types: EnergyType[] = [W, R, G, M, F, L, X];
  for (let i = 0; i < 40; i++) pool[`p${i}`] = card(`Mon${i}`, types[i % types.length], 100, null, [["Hit", [X], 30]]);
  for (const id of fxIds) { pool[id] = card(id, W, 100, null, [["Zap", [X], 20]]); pool[id].moves[0].fx = [{ c: "paralyzed" }]; }
  const ids = Object.keys(pool);
  let withFx = 0;
  for (let i = 0; i < 200; i++) {
    const pk = drawPack(ids, pool, duelRand(`fx-${i}`), 2, true);
    if (pk && pk.some((id) => fxIds.includes(id))) withFx++;
  }
  check(withFx === 200, `rules 3 sixes always hold a condition card (${withFx}/200)`);
  const none = drawPack(ids.filter((id) => !fxIds.includes(id)), pool, duelRand("fx-none"), 2, true);
  check(!!none && none.length === 6, "with no condition cards to draw, any six will do");

  // Rules 4: bring as many as the trainer (at least 3); a short team's cards start with Energy.
  const four: DuelSetup = { ...mk(), rules: 4, seed: "b", bring: 3, foeHead: 3 };
  const b0 = startState(four);
  check(b0.foe.every((f) => f.energy.length === 3), "a 2-card team's cards start with 3 Energy");
  check(applyStep(four, b0, { next: 0 }) === null, "the lead waits for the cards you bring");
  check(applyStep(four, b0, { bring: [0, 1] }) === null && applyStep(four, b0, { bring: [0, 0, 1] }) === null && applyStep(four, b0, { bring: [0, 1, 9] }) === null, "a pick of the wrong size, a repeat or a card that isn't there is refused");
  const b1 = applyStep(four, b0, { bring: [4, 0, 2] })!;
  check(JSON.stringify(b1.brought) === "[0,2,4]" && JSON.stringify(nexts(b1)) === "[0,2,4]", "you lead from the cards you brought");
  const v1 = viewOf(four, b0, TRAINER);
  check(v1.needsBring && v1.bring === 3 && !v1.needsNext, "the view asks for the pick first");
  const b2 = applyStep(four, b1, { next: 0 })!;
  check(!isLegal(four, b2, { attach: 1, act: { wait: true } }) && isLegal(four, b2, { attach: 2, act: { wait: true } }), "Energy only goes on cards you brought");
  check(JSON.stringify(swapTargets(b2)) === "[2,4]", "you only swap to cards you brought");
  const v2 = viewOf(four, b2, TRAINER);
  check(v2.you[1].sat && !v2.you[0].sat && v2.cardsLeft === 3, "the others sit out and don't count");
  const ko = cloneState(b2);
  for (const i of [0, 2, 4]) ko.you[i].out = true;
  check(viewOf(four, ko, TRAINER).cardsLeft === 0, "losing the three you brought is all of them");
  // makeSetup sets it from the trainer's team.
  const sized = (n: number) => makeSetup(FIX_CARDS, { ...FIX_TRAINERS[0], team: FIX_TRAINERS[0].team.concat(FIX_TRAINERS[1]?.team ?? []).slice(0, n) }, FIX_POOL.slice(0, 6), Array(TURN_CAP).fill("Colorless"), [], { rules: 4, seed: "s" });
  const s3 = sized(3);
  check(!!s3 && s3.bring === 3 && s3.foeHead === 2, "a 3-card team: bring 3, its cards start with 2 Energy");
  const s5 = sized(5);
  if (s5 && s5.foe.length === 5) check(s5.bring === 5 && !s5.foeHead, "a 5-card team: bring 5, no head start");
  // The solver searches every pick and its line replays.
  const sol4 = solve(solverSetup(four), { width: 120 });
  check(!!sol4 && "bring" in sol4.line[0] && replay(solverSetup(four), sol4.line)?.over === "won", "a rules 4 line starts with the pick and replays to a win");
  check(obviousPlay(four).line.length > 0 && "bring" in obviousPlay(four).line[0], "the obvious play makes a pick too");
}

// ─── rules 5: the Energy hand, the comeback charge, "+" and "×" attacks ──────

{
  const row: EnergyType[] = [W, R, G, M, F, L, X, W, R, G];
  const H5: DuelSetup = { ...mk({ row }), hand: HAND_SIZE, comeback: COMEBACK_MAX, rules: 5 };
  const s0 = startState(H5);
  check(s0.hand?.join() === [W, R, G].join() && s0.drawn === 3, "rules 5: the hand starts with the row's first three");
  const s1 = begin(H5, s0, 0);
  check(s1.pending === W, "rules 5: the hand's first Energy stands in until a turn picks one");
  check(!isLegal(H5, s1, { attach: 0, act: { wait: true }, use: 3 }) && !isLegal(H5, s1, { attach: 0, act: { wait: true }, use: -1 }), "rules 5: a hand index outside the hand is refused");
  const s2 = step(H5, s1, { attach: 0, act: { wait: true }, use: 1 });
  check(s2.you[0].energy.join() === R && s2.hand?.join() === [W, G, M].join() && s2.drawn === 4, "rules 5: playing the Fire puts it on and draws the row's next", { e: s2.you[0].energy, hand: s2.hand });
  // One action per different type in the hand (two Waters count once).
  const dup: DuelSetup = { ...H5, row: [W, W, R, G, M, F] };
  const sd = begin(dup, startState(dup), 0);
  const uses = new Set(actions(dup, sd).filter((a) => a.attach === 0 && "wait" in a.act).map((a) => a.use));
  check(uses.size === 2, "rules 5: two Energy of one type in the hand are one choice", [...uses]);
  // Ready with the picked Energy: Splash (Water) is ready with a Water, not with the Fire.
  check(canUse(H5, s1, 0, 0, 0) && !canUse(H5, s1, 0, 0, 1), "rules 5: a move is ready only with the Energy that covers it");
  const v = viewOf(H5, s1, TRAINER);
  check(v.energy.hand?.join() === [W, R, G].join() && v.energy.next.join() === [M, F, L].join() && v.rules === 5, "rules 5: the view shows the hand and the next three it draws", v.energy);
  check(viewOf(SET, setup1(), TRAINER).energy.hand === null, "rules 5: older days have no hand in the view");

  // The comeback: a card sent in after a knockout brings an Energy per card lost, up to 2.
  let k = cloneState(s2);
  k.you[0].out = true; k.you[0].cur = 0; k.turn = 3;
  const c1 = begin(H5, k, 1);
  check(c1.you[1].energy.length === 1 && c1.fx.fresh === 1 && viewOf(H5, c1, TRAINER).inPlay.fresh === 1, "rules 5: the first card back comes in with an Energy", c1.you[1].energy);
  check(c1.you[1].energy[0] === "Fire", "rules 5: the comeback Energy is the card's own type when it needs it", c1.you[1].energy);
  k = cloneState(c1);
  k.you[1].out = true; k.you[1].cur = 0; k.you[2].out = true; k.you[2].cur = 0;
  const c2 = begin(H5, k, 3);
  check(c2.you[3].energy.length === COMEBACK_MAX, "rules 5: the comeback stops at two Energy", c2.you[3].energy);
  check(begin(H5, startState(H5), 0).fx.fresh === undefined || begin(H5, startState(H5), 0).fx.fresh === 0, "rules 5: the lead brings nothing");
  check(begin(SET, k, 3).you[3].energy.length === 0, "rules 5: older days have no comeback");
  const c3 = applyStep(H5, c1, { attach: 1, act: { wait: true }, use: 0 });
  check(!!c3 && (c3.over != null || !c3.fx.fresh), "rules 5: the comeback chip lasts only the turn the card came in", c3?.fx);

  // "+" and "×" attacks.
  const plusCard = (n: string, d: number, plus: DuelCard["moves"][number]["plus"]): DuelCard => ({ ...card(n, X, 120, null, [[n, [X], d]]), moves: [{ n, cost: [X], d, plus }] });
  const rout = plusCard("rout", 10, { op: "+", kind: "foeBench", per: 30 });
  const charge = plusCard("charge", 30, { op: "x", kind: "selfEnergy", per: 30 });
  const hunt = plusCard("hunt", 30, { op: "+", kind: "foeEx", per: 50, flat: true });
  const swoop = plusCard("swoop", 20, { op: "+", kind: "arrived", per: 60, flat: true });
  const capped = plusCard("capped", 20, { op: "+", kind: "selfDamage", per: 10, max: 30 });
  const foeEx: DuelCard = { ...FOE[0], ex: true };
  const P5: DuelSetup = { ...H5, you: [rout, charge, hunt, swoop, capped, YOU[5]], foe: [foeEx, FOE[1]] };
  const p = begin(P5, startState(P5), 0);
  check(printedDamage(p, rout, foeEx, rout.moves[0], true) === 40, "rules 5: Rout adds 30 for the trainer's one waiting card", printedDamage(p, rout, foeEx, rout.moves[0], true));
  const pe = cloneState(p); pe.you[1].energy = [W, W, R];
  check(printedDamage(pe, charge, foeEx, charge.moves[0], true, { att: pe.you[1] }) === 90, "rules 5: a × attack is 30 for each Energy on it (three Energy, 90)");
  check(printedDamage(p, hunt, foeEx, hunt.moves[0], true) === 80 && printedDamage(p, hunt, FOE[1], hunt.moves[0], true) === 30, "rules 5: +50 against an ex, nothing more against anything else");
  const sw = begin(P5, (() => { const x = cloneState(p); x.you[0].out = true; x.turn = 2; return x; })(), 3);
  check(printedDamage(sw, swoop, foeEx, swoop.moves[0], true) === 80, "rules 5: +60 on the turn the card came in");
  const sw2 = step(P5, sw, { attach: 3, act: { wait: true }, use: 0 });
  const sw3 = begin(P5, sw2, null);
  check(sw3.over || printedDamage(sw3, swoop, foeEx, swoop.moves[0], true) === 20, "rules 5: and not the turn after");
  const hurt = cloneState(p); hurt.you[4].cur = 40;
  check(printedDamage(hurt, capped, foeEx, capped.moves[0], true, { att: hurt.you[4] }) === 50, "rules 5: a capped attack stops at its cap (+30 at most)");
  check(damageOf(p, rout, foeEx, rout.moves[0], true) === 40, "rules 5: damageOf starts from the counted damage");
  const v5 = viewOf(P5, p, TRAINER);
  check(v5.you[0].moves[0].plus === "+30 for each of the trainer's waiting cards" && v5.you[0].moves[0].damage === 40, "rules 5: the view says what Rout counts, and its damage counts it", v5.you[0].moves[0]);
  check(plusText({ op: "x", kind: "selfEnergy", per: 30, t: "Fire" }) === "30 for each Fire Energy on this card", "rules 5: × words");
  check(plusText({ op: "+", kind: "foeBench", per: 20 }, false) === "+20 for each of your waiting cards", "rules 5: a trainer's card counts your cards");

  // Reading "+" and "×" off the card's text (cardRules plusOf).
  const po = (d: string, text: string) => plusOf(d, text);
  check(po("10+", "This attack does 30 more damage for each of your opponent's Benched Pokémon.")?.kind === "foeBench", "plusOf: more for each Benched Pokémon of the opponent");
  check(JSON.stringify(po("30×", "This attack does 30 damage for each Energy attached to this Pokémon.")) === JSON.stringify({ op: "x", kind: "selfEnergy", per: 30 }), "plusOf: × for each Energy on it", po("30×", "This attack does 30 damage for each Energy attached to this Pokémon."));
  check(po("60+", "Flip a coin. If heads, this attack does 60 more damage.") === undefined, "plusOf: a coin flip never counts");
  check(po("20+", "This attack does 20 more damage for each damage counter on all of your Pokémon.")?.kind !== "selfDamage", "plusOf: \"all of your Pokémon\" isn't this card");
  check(po("100", "This attack does 30 more damage for each of your opponent's Benched Pokémon.") === undefined, "plusOf: a plain number has no count");

  // Older rules: the same cards play their printed number (makeSetup strips the count).
  const card5 = Object.values(FIX_CARDS)[0];
  const t5 = FIX_TRAINERS[0];
  const s4 = makeSetup({ ...FIX_CARDS, [card5.id]: { ...card5, moves: card5.moves.map((m) => ({ ...m, plus: { op: "+" as const, kind: "foeBench" as const, per: 10 } })) } }, t5, FIX_POOL.slice(0, 6), Array(TURN_CAP).fill(W), [], { rules: 4 });
  check(!!s4 && s4.you.concat(s4.foe).every((c) => c.moves.every((m) => !m.plus)) && !s4.hand && !s4.comeback, "rules 5: older rules strip the counts and have no hand or comeback");
  const s5 = makeSetup(FIX_CARDS, t5, FIX_POOL.slice(0, 6), Array(TURN_CAP).fill(W), [], { rules: 5 });
  check(!!s5 && s5.hand === HAND_SIZE && s5.comeback === COMEBACK_MAX, "rules 5: makeSetup turns on the hand and the comeback");

  // The professor's tip names the Energy from the hand.
  const tip = hintText(H5, s1, { attach: 0, act: { move: 0 }, use: 0 });
  check(/^Play the Water Energy on aqua, then use Splash/.test(tip), "rules 5: the tip names the Energy from the hand", tip);
  const tip2 = hintText(H5, s1, { attach: 1, act: { wait: true }, use: 1 });
  check(/Fire Energy on ember/.test(tip2), "rules 5: and the card it goes on", tip2);

  // The slipping player: deterministic.
  check(slipWinRate(H5, "t") === slipWinRate(H5, "t"), "rules 5: the slipping player's share is the same every time");
}

// ─── rules 6: the trainer on the same rules, and the score ───────────────────

{
  const row6 = foeRowFor(FOE, "t6:foe");
  check(row6.length === 40 && row6.every((t) => t === R || t === G) && JSON.stringify(foeRowFor(FOE, "t6:foe")) === JSON.stringify(row6), "rules 6: the trainer's row is 40 of its team's types, the same every time");
  check(JSON.stringify(foeRowFor(FOE, "other:foe")) !== JSON.stringify(row6), "rules 6: a different day draws a different row");
  const S6: DuelSetup = { ...mk({ row: Array(TURN_CAP).fill(W) }), hand: HAND_SIZE, comeback: COMEBACK_MAX, foeHand: HAND_SIZE, foeRow: [G, R, G, R, R, G, R, R, R, R], foeComeback: COMEBACK_MAX, rules: 6 };
  const a0 = startState(S6);
  check(a0.foeHand?.join() === [G, R, G].join() && a0.foeDrawn === 3, "rules 6: the trainer starts with its row's first three");
  // Blaze (Fire) on the field wants Fire for Inferno: it takes the Fire from its hand and draws the next.
  const a1 = step(S6, begin(S6, a0, 0), { attach: 0, act: { wait: true }, use: 0 });
  check(a1.foe[0].energy.join() === R && a1.foeHand?.join() === [G, G, R].join() && a1.foeDrawn === 4, "rules 6: the trainer plays the Energy its card needs from its hand, then draws", { e: a1.foe[0].energy, hand: a1.foeHand });
  check(a1.log.some((l) => l.side === "foe" && /Tester plays Fire Energy on blaze/.test(l.text)), "rules 6: the log says what the trainer played", a1.log.map((l) => l.text));
  // The trainer's comeback: knock out Blaze and Vine comes in with an Energy for the card lost.
  const k6 = cloneState(begin(S6, a0, 0));
  k6.foe[0].cur = 10;
  k6.you[0].energy = [W, W];
  const k7 = step(S6, k6, { attach: 0, act: { move: 1 }, use: 0 });
  check(k7.fi === 1 && k7.foe[1].energy.length >= 1 && k7.log.some((l) => /vine comes in with an Energy for coming back/.test(l.text)), "rules 6: the trainer's next card comes in with an Energy for the card it lost", { fi: k7.fi, e: k7.foe[1].energy, log: k7.log.map((l) => l.text) });
  const k5 = step({ ...S6, foeComeback: undefined }, cloneState(k6), { attach: 0, act: { move: 1 }, use: 0 });
  check(k5.fi === 1 && !k5.log.some((l) => /for coming back/.test(l.text) && l.side === "foe"), "rules 6: without foeComeback (older days) the trainer's card comes in as before");
  const m6 = makeSetup(FIX_CARDS, FIX_TRAINERS[0], FIX_POOL.slice(0, 6), Array(TURN_CAP).fill(W), [], { rules: 6, seed: "2026-11-01" });
  const m5 = makeSetup(FIX_CARDS, FIX_TRAINERS[0], FIX_POOL.slice(0, 6), Array(TURN_CAP).fill(W), [], { rules: 5, seed: "2026-11-01" });
  check(!!m6 && m6.foeHand === HAND_SIZE && m6.foeComeback === COMEBACK_MAX && (m6.foeRow?.length ?? 0) === 40, "rules 6: makeSetup gives the trainer its hand, row and comeback");
  check(!!m5 && !m5.foeHand && !m5.foeComeback && !m5.foeRow, "rules 6: rules 5 days keep the trainer as it was");

  // The score.
  const best = duelScore({ won: true, turns: 9, par: 9, seconds: 100, solo: true, knocked: 5 });
  check(best.score === 1000 && best.points === 10, "score: par, inside the time, solo = 1,000 (10 points)", best);
  const ex = duelScore({ won: true, turns: 10, par: 9, seconds: 165, solo: true, knocked: 5 });
  check(ex.turns === 550 && ex.time === 230 && ex.solo === 150 && ex.score === 930 && ex.points === 9, "score: 10 turns at par 9 in 2:45, solo = 930", ex);
  const slow = duelScore({ won: true, turns: 30, par: 9, seconds: 4000, solo: false, knocked: 5 });
  check(slow.turns === SCORE.turnsFloor && slow.time === 0 && slow.solo === 0 && slow.score === 200, "score: a win never drops below 200", slow);
  const lost = duelScore({ won: false, turns: 12, par: 9, seconds: 300, solo: true, knocked: 3 });
  check(lost.score === 60 && lost.points === 0 && lost.solo === 0, "score: a loss is 20 per knockout and no solo bonus", lost);
  check(duelScore({ won: false, turns: 12, par: 9, seconds: 300, solo: true, knocked: 9 }).score === SCORE.koMax, "score: a loss tops out at 100");
  check(duelScore({ won: true, turns: 9, par: 9, seconds: 9 * 15 + 1, solo: true, knocked: 5 }).time === 240, "score: one second over the allowance costs one step (10)");
  const scoredShare = duelShareText({ number: 3, trainer: "Bea", won: true, turns: 6, par: 6, seconds: 72, standing: [true, true, true, true, true, false], knocked: 5, team: 5, score: 1000 });
  check(scoredShare.includes("· Score 1,000") && !/Hoopa|Grapploct/.test(scoredShare), "share: a scored day adds the score, never a card's name");
  check(!duelShareText({ number: 3, trainer: "Bea", won: true, turns: 6, par: 6, seconds: 72, standing: [true], knocked: 5, team: 5 }).includes("Score"), "share: older days have no score");
  // Hard mode: +200 on a win, the solo bonus always, up to 12 points; a loss gets no bonus.
  const hard = duelScore({ won: true, turns: 9, par: 9, seconds: 100, solo: false, knocked: 5, hard: true });
  check(hard.score === 1200 && hard.hard === SCORE.hard && hard.solo === SCORE.solo && hard.points === 12, "score: a Hard win at par = 1,200 (12 points)", hard);
  const hardLoss = duelScore({ won: false, turns: 12, par: 9, seconds: 300, solo: false, knocked: 3, hard: true });
  check(hardLoss.score === 60 && hardLoss.hard === 0 && hardLoss.points === 0, "score: a Hard loss scores like any loss", hardLoss);
  check(duelScore({ won: true, turns: 9, par: 9, seconds: 100, solo: true, knocked: 5 }).hard === 0, "score: Normal has no Hard part");
  const hardShare = duelShareText({ number: 3, trainer: "Bea", won: true, turns: 6, par: 6, seconds: 72, standing: [true], knocked: 5, team: 5, score: 1200, hard: true });
  check(hardShare.includes("(Hard)") && hardShare.includes("· Score 1,200"), "share: a Hard duel says Hard");
  const hs = hardSetup({ comeback: 2, foeComeback: 2 } as never);
  check(hs.comeback === 0 && hs.foeComeback === 2, "hard: your comeback goes, the trainer's stays");
}

// ─── the real roster (when it's there): a day builds the same twice ──────────

async function real() {
  try {
    const { DUEL_DATA } = await import("../src/lib/originals/duel/data");
    // #1 (the first day with conditions) builds the same twice under rules 2, beatable, findable.
    const day = DUEL_EPOCH;
    const a = buildDay(day, DUEL_DATA.pool, DUEL_DATA.cards, DUEL_DATA.trainers, "", { budgetMs: 120_000, rules: 2 });
    const b = buildDay(day, DUEL_DATA.pool, DUEL_DATA.cards, DUEL_DATA.trainers, "", { budgetMs: 120_000, rules: 2 });
    check(!!a && JSON.stringify({ ...a, ms: 0 }) === JSON.stringify({ ...b, ms: 0 }), "the real roster: duel #1 builds the same twice");
    if (a) {
      const tr = DUEL_DATA.trainers.find((t) => t.id === a.trainerId)!;
      const set = makeSetup(DUEL_DATA.cards, tr, a.pack, a.row, a.events, { rules: 2, seed: day })!;
      check(a.rules === 2 && replay(solverSetup(set), a.line)?.over === "won" && !obviousPlay(set).won, `the real roster: duel #1 (${tr.name}, par ${a.par}) is beatable and beats the obvious play`);
      check(a.fair >= FAIR_LEADS[a.tier] && fairLeads(solverSetup(set)) === a.fair, `the real roster: duel #1 is findable (a one-turn-ahead player wins from ${a.fair} leads)`);
    }
    // The warm-up (the day the Duel opened, first rules): its trainer is the rotation's, Larry. A built
    // day keeps its own copy of its cards, so later card data changes never change it.
    const warm = buildDay(DUEL_WARMUP, DUEL_DATA.pool, DUEL_DATA.cards, DUEL_DATA.trainers, "", { budgetMs: 120_000 });
    const warmTr = warm && DUEL_DATA.trainers.find((t) => t.id === warm.trainerId);
    // The warm-up was Larry (production stores it). Adding a person to a tier reshuffles that tier's
    // rotation for days not built yet (Glacia, 2026-10-23), so today's roster can name someone else;
    // stored days never change.
    check(warmTr?.tier === "elite" && duelNumber(DUEL_WARMUP) === 0, `the real roster: the warm-up is an Elite Four day (got ${warmTr?.name})`);
    // A Saturday: a villain team's boss, beatable, the obvious play loses.
    const sat = buildDay("2026-10-31", DUEL_DATA.pool, DUEL_DATA.cards, DUEL_DATA.trainers, "", { budgetMs: 120_000 });
    const boss = sat && DUEL_DATA.trainers.find((t) => t.id === sat.trainerId);
    const bossSet = sat && boss && makeSetup(DUEL_DATA.cards, boss, sat.pack, sat.row, sat.events);
    check(!!bossSet && sat!.tier === "boss" && boss!.tier === "boss" && replay(bossSet, sat!.line)?.over === "won" && !obviousPlay(bossSet).won,
      `the real roster: a Saturday is a boss's day (${boss?.name}, par ${sat?.par}${sat?.inBand ? "" : ", outside the band"})`);
    check(!!sat && sat.fair >= FAIR_LEADS.boss, `the real roster: the Saturday is findable (${sat?.fair} leads)`);
    // Rules 6: a day on target with at least two plans, each carried by a different card.
    const r5 = buildDay("2026-11-05", DUEL_DATA.pool, DUEL_DATA.cards, DUEL_DATA.trainers, "", { budgetMs: 120_000, rules: 6 });
    const r5Tr = r5 && DUEL_DATA.trainers.find((t) => t.id === r5.trainerId);
    const r5Set = r5 && r5Tr && makeSetup(DUEL_DATA.cards, r5Tr, r5.pack, r5.row, r5.events, { rules: 6, seed: r5.day });
    check(!!r5Set && r5!.rules === 6 && r5!.inBand && replay(solverSetup(r5Set), r5!.line)?.over === "won", `the real roster: a rules 6 day builds on target (${r5Tr?.name}, par ${r5?.par})`);
    const ob5 = r5Set ? obviousPlay(r5Set) : null;
    check(!!ob5 && !(ob5.won && ob5.turns <= r5!.par), "the real roster: the rules 6 obvious play doesn't reach par", ob5);
    check(!!r5 && r5.winRate! >= WIN_BAND[r5.tier][0] && r5.winRate! <= WIN_BAND[r5.tier][1], `the real roster: the slipping player wins about the weekday's share (${Math.round((r5?.winRate ?? 0) * 100)}%)`);
    check(!!r5 && (r5.plans?.length ?? 0) >= MIN_PLANS && new Set(r5.plans!.map((p) => p.carry)).size === r5.plans!.length, "the real roster: at least two plans, a different card carrying each", r5?.plans);
    check(!!r5Set && JSON.stringify(dayPlans(r5Set, { par: r5!.par, line: r5!.line, nodes: 0 })) === JSON.stringify(r5!.plans), "the real roster: the plans come out the same again");
    const r5b = buildDay("2026-11-05", DUEL_DATA.pool, DUEL_DATA.cards, DUEL_DATA.trainers, "", { budgetMs: 120_000, rules: 6 });
    check(!!r5b && JSON.stringify(r5b.pack) === JSON.stringify(r5!.pack) && r5b.par === r5!.par, "the real roster: a rules 6 day builds the same twice");
    // Hard's par: a line that wins without your comeback Energy, the same every time (0 = Hard closed that day).
    const hp = r5Set ? hardParFor(r5Set) : -1;
    check(hp >= 0 && hp === (r5Set ? hardParFor(r5Set) : -2), `the real roster: Hard's par comes out the same again (${hp})`);
    check(!r5 || hp === 0 || hp >= r5.par, "the real roster: Hard's par is never quicker than Normal's", { hard: hp, par: r5?.par });
    // Every person in a tier has a day before anyone comes back (Mondays and Tuesdays from the anchor).
    const gymPeople = peopleOf(DUEL_DATA.trainers.filter((t) => t.tier === "gym")).length;
    const gymDays: string[] = [];
    for (let d = "2026-01-05"; gymDays.length < gymPeople; d = gsAddDays(d, 1)) if (tierFor(d) === "gym") gymDays.push(personOf(trainerFor(d, DUEL_DATA.trainers)!));
    check(new Set(gymDays).size === gymPeople, `the real roster: all ${gymPeople} gym people have a day in the first cycle`);
  } catch (e) {
    console.log("(real roster not checked:", (e as Error).message, ")");
  }
}

void real().then(() => {
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
