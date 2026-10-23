/**
 * Daily Duel: the solver and the day builder (pure). Ported from the mockup's solve.cjs.
 *
 * The trainer and the events never choose anything (no coin flips), so a duel is a search over
 * your own choices only: a beam search, one turn deep at a time, keeps the most promising few
 * hundred positions (identical positions merged) and stops at the first win. That turn count is
 * the day's par. It's a heuristic, so a player can beat par; it never claims a win that isn't one
 * (the line it returns replays through the engine).
 *
 * A day is accepted only when the solver wins and the obvious play (lead with the hardest hitter,
 * Energy on the card on the field, always the strongest move it can use, the first card left when
 * one is knocked out) loses, and its par sits in the tier's band (rules.ts PAR_BAND). It must also
 * be findable (Britton, 2026-10-22: hard is the appeal, but a person has to be able to find a way):
 * a player who reads one turn ahead (lookaheadPlay) wins from at least FAIR_LEADS of the six leads.
 * #1 passed that; four of the next six days built without it failed it from every lead. Packs are
 * strength-matched to the team (packCap): light teams like the Kanto gym leaders' 2000-era cards
 * face cards of their own weight, so those days aren't won by the obvious play.
 *
 * With the condition rules (rules 2) par and the findable check play with `luck: "miss"`: your
 * moves' conditions never land, so par never counts on luck (picks 2026-10-22). The trainer's rolls
 * count (they're the same for everyone). The obvious play is judged with real luck: it mustn't win.
 */

import {
  actions, applyStep, begin, damageOf, foeChoice, foeRowFor, inDuel, isLegal, needsBring, needsNext, nexts, startState, step, topDamage, youLeft,
  TURN_CAP, type DuelSetup, type DuelState,
} from "./engine";
import { PAR_BAND, duelNumber, duelRand, energyRow, eventPlan, peopleNear, peopleOf, personOf, shuffleWith, speciesOf, tierFor, trainerFor } from "./rules";
import type { DuelAction, DuelCard, DuelEventAt, DuelRules, DuelStep, DuelTier, DuelTrainer, EnergyType } from "./types";
import type { DuelHintView } from "./view";

// ─── the search ──────────────────────────────────────────────────────────────

interface Node { s: DuelState; prev: Node | null; steps: DuelStep[]; score: number }

const CODE: Record<EnergyType, string> = { Grass: "g", Fire: "r", Water: "w", Lightning: "l", Psychic: "p", Fighting: "f", Darkness: "d", Metal: "m", Dragon: "n", Colorless: "c" };

/** A card's conditions in a position's key (rules 2): the lasting one with its count, and Confused's turns. */
const condKey = (c: { cond?: { k: string; n: number }; conf?: number }) => `${c.cond ? `${c.cond.k[0]}${c.cond.n}` : ""}${c.conf ? `c${c.conf}` : ""}`;

/** A position's identity: two ways of reaching the same position are one. Energy order doesn't matter. */
function keyOf(s: DuelState): string {
  const f = s.fx;
  let k = `${s.brought ? s.brought.join("") : ""}/${s.yi}.${s.fi}.${f.weather ?? "-"}${f.weatherLeft}.${f.crit ? 1 : 0}${f.confused ? 1 : 0}${f.aceYou ? 1 : 0}${f.arrived ?? ""}.${f.sleep}.${f.aceFoe}.${f.boost}.${f.rocket}${f.rocketLeft}`;
  if (s.hand) k += `/h${s.hand.map((e) => CODE[e]).sort().join("")}`;
  for (const c of s.you) {
    if (c.out) { k += "|x"; continue; }
    k += `|${c.cur}:`;
    k += c.energy.length > 1 ? c.energy.map((e) => CODE[e]).sort().join("") : c.energy.length ? CODE[c.energy[0]] : "";
    k += condKey(c);
  }
  // The trainer's Energy follows a fixed rule, so for the same card the count says it all; under rules 6
  // its hand (and so the types it holds) depends on the path, so the types count too.
  if (s.foeHand) {
    k += `/f${s.foeHand.map((e) => CODE[e]).sort().join("")}`;
    for (const c of s.foe) k += c.out ? "|x" : `|${c.cur}:${c.energy.map((e) => CODE[e]).sort().join("")}${condKey(c)}`;
    return k;
  }
  for (const c of s.foe) k += c.out ? "|x" : `|${c.cur}:${c.energy.length}${condKey(c)}`;
  return k;
}

/** How much of a cost these Energy cover, 0 to 1 (colored dots first, then Colorless from what's left). */
function coverage(energy: readonly EnergyType[], cost: readonly EnergyType[]): number {
  if (!cost.length) return 1;
  const left = energy.slice();
  let got = 0;
  let colorless = 0;
  for (const t of cost) {
    if (t === "Colorless") { colorless++; continue; }
    const i = left.indexOf(t);
    if (i >= 0) { left.splice(i, 1); got++; }
  }
  return (got + Math.min(colorless, left.length)) / cost.length;
}

/**
 * Lower is better: the trainer's HP left, less a share of yours, less what your standing cards
 * could hit its card on the field for (each move's damage times how much of its cost is covered),
 * less a bonus per knockout. Tuned against the mockup's 28 packs: this finds 17 wins at width 300
 * where HP and Energy counts alone found 7 (and 16 at width 1500).
 */
export function scoreState(setup: DuelSetup, s: DuelState): number {
  let foe = 0;
  let ko = 0;
  for (const c of s.foe) if (c.out) ko++; else foe += c.cur;
  let you = 0;
  let reach = 0;
  const def = setup.foe[s.fi];
  for (let i = 0; i < s.you.length; i++) {
    const c = s.you[i];
    if (c.out || !inDuel(s, i)) continue;
    you += c.cur;
    const card = setup.you[i];
    let best = 0;
    for (const m of card.moves) {
      const v = damageOf(s, card, def, m, true) * coverage(c.energy, m.cost);
      if (v > best) best = v;
    }
    reach += best;
  }
  return foe - 0.6 * you - 0.5 * reach - 40 * ko;
}

function lineOf(node: Node | null, tail: DuelStep[]): DuelStep[] {
  const parts: DuelStep[][] = [tail];
  for (let n = node; n; n = n.prev) parts.push(n.steps);
  return parts.reverse().flat();
}

export interface DuelSolution {
  /** The fewest turns the search found a win in. */
  par: number;
  /** The winning line, replayable from the start (engine.replay). */
  line: DuelStep[];
  /** Positions looked at. */
  nodes: number;
}

/**
 * Beam search for a win. `width` positions are kept per turn; `deadline` (epoch ms) stops early
 * with null. Deterministic: the same setup and width always give the same answer. `from`: search
 * from a turn in progress instead of the start (Professor's advice); the line then starts there.
 * `maxNodes`: give up (null) after this many positions, a limit that's the same on every machine.
 */
export function solve(setup: DuelSetup, opts: { width?: number; deadline?: number; maxNodes?: number; score?: (setup: DuelSetup, s: DuelState) => number; from?: DuelState } = {}): DuelSolution | null {
  const width = opts.width ?? 300;
  const deadline = opts.deadline ?? Infinity;
  const maxNodes = opts.maxNodes ?? Infinity;
  const scoreOf = opts.score ? (s: DuelState) => opts.score!(setup, s) : (s: DuelState) => scoreState(setup, s);
  const s0 = startState(setup);
  let nodes = 0;
  // Rules 4: every pick of the cards you bring, each with every lead; else every lead.
  const starts = needsBring(setup, s0)
    ? subsets(setup.you.length, setup.bring!).map((pick) => ({ s: applyStep(setup, s0, { bring: pick })!, steps: [{ bring: pick }] as DuelStep[] }))
    : [{ s: s0, steps: [] as DuelStep[] }];
  let frontier: Node[] = opts.from
    ? [{ s: opts.from, prev: null, steps: [], score: scoreOf(opts.from) }]
    : starts.flatMap((st) => nexts(st.s).map((i) => {
      const s = begin(setup, st.s, i, true);
      return { s, prev: null, steps: [...st.steps, { next: i }], score: scoreOf(s) };
    }));
  for (let depth = 0; depth < TURN_CAP; depth++) {
    const seen = new Map<string, Node>();
    const add = (prev: Node, s: DuelState, steps: DuelStep[]) => {
      const k = keyOf(s);
      if (!seen.has(k)) seen.set(k, { s, prev, steps, score: scoreOf(s) });
    };
    for (let i = 0; i < frontier.length; i++) {
      const node = frontier[i];
      for (const a of actions(setup, node.s)) {
        const t = step(setup, node.s, a, true);
        nodes++;
        if (t.over === "won") return { par: t.turn, line: lineOf(node, [a]), nodes };
        if (t.over) continue;
        if (needsNext(t)) for (const nx of nexts(t)) add(node, begin(setup, t, nx, true), [a, { next: nx }]);
        else add(node, begin(setup, t, null, true), [a]);
      }
      if ((i & 15) === 0 && (Date.now() > deadline || nodes > maxNodes)) return null;
    }
    if (!seen.size) return null;
    frontier = [...seen.values()].sort((x, y) => x.score - y.score).slice(0, width);
  }
  return null;
}

/** The obvious play's action this turn: Energy on the card on the field, then its strongest usable move, else wait. */
export function obviousAction(setup: DuelSetup, s: DuelState): DuelAction {
  const acts = actions(setup, s).filter((a) => a.attach === s.yi && "move" in a.act);
  let best: DuelAction | null = null;
  let bestD = -1;
  const att = setup.you[s.yi];
  const def = setup.foe[s.fi];
  for (const a of acts) {
    const d = damageOf(s, att, def, att.moves[(a.act as { move: number }).move], true);
    if (d > bestD) { best = a; bestD = d; }
  }
  return best ?? { attach: s.yi, act: { wait: true } };
}

/** Every pick of `k` of `n` cards, in index order. */
export function subsets(n: number, k: number): number[][] {
  const out: number[][] = [];
  const walk = (start: number, cur: number[]) => {
    if (cur.length === k) { out.push(cur); return; }
    for (let i = start; i < n; i++) walk(i + 1, [...cur, i]);
  };
  walk(0, []);
  return out;
}

/** The obvious pick (rules 4): the hardest hitters. */
export function obviousBring(setup: DuelSetup): number[] {
  return setup.you.map((c, i) => ({ i, d: topDamage(c), hp: c.hp })).sort((a, b) => b.d - a.d || b.hp - a.hp || a.i - b.i).slice(0, setup.bring).map((x) => x.i).sort((a, b) => a - b);
}

/**
 * A thinking person's pick (rules 4, the findable check): the cards that hit the trainer's team
 * hardest, counting Weakness, as a share of each trainer card's HP.
 */
export function smartBring(setup: DuelSetup): number[] {
  const s0 = startState(setup);
  const score = (c: DuelCard) => setup.foe.reduce((n, f) => n + Math.min(1, Math.max(0, ...c.moves.map((m) => damageOf(s0, c, f, m, true))) / f.hp), 0);
  return setup.you.map((c, i) => ({ i, v: score(c), hp: c.hp })).sort((a, b) => b.v - a.v || b.hp - a.hp || a.i - b.i).slice(0, setup.bring).map((x) => x.i).sort((a, b) => a - b);
}

/** The duel after the cards you bring are picked (rules 4), or the start as it is. */
function afterBring(setup: DuelSetup, pick: number[]): { s: DuelState; line: DuelStep[] } {
  const s0 = startState(setup);
  if (!needsBring(setup, s0)) return { s: s0, line: [] };
  return { s: applyStep(setup, s0, { bring: pick })!, line: [{ bring: pick }] };
}

/** The obvious play from the start: does it win, and in how many turns. */
export function obviousPlay(setup: DuelSetup): { won: boolean; turns: number; line: DuelStep[] } {
  const start = afterBring(setup, obviousBring(setup));
  const pool = nexts(start.s);
  let lead = pool[0];
  for (const i of pool) if (topDamage(setup.you[i]) > topDamage(setup.you[lead])) lead = i;
  const line: DuelStep[] = [...start.line, { next: lead }];
  let s = begin(setup, start.s, lead, true);
  while (!s.over) {
    const a = obviousAction(setup, s);
    line.push(a);
    s = step(setup, s, a, true);
    if (s.over) break;
    const nx = needsNext(s) ? nexts(s)[0] : null;
    if (nx != null) line.push({ next: nx });
    s = begin(setup, s, nx, true);
  }
  return { won: s.over === "won", turns: s.turn, line };
}

/** One turn as a person weighs it: what it took off the trainer's cards against what it cost yours (a knockout counts 200). */
function turnScore(before: DuelState, after: DuelState): number {
  if (after.over === "won") return 1e6;
  if (after.over === "lost") return -1e6;
  let dealt = 0;
  let taken = 0;
  for (let i = 0; i < before.foe.length; i++) dealt += (before.foe[i].out ? 0 : before.foe[i].cur) - (after.foe[i].out ? -200 : after.foe[i].cur);
  for (let i = 0; i < before.you.length; i++) taken += (before.you[i].out ? 0 : before.you[i].cur) - (after.you[i].out ? -200 : after.you[i].cur);
  return dealt - 0.8 * taken;
}

/** The lookahead player's best action this turn and where it leaves the duel. */
function bestTurn(setup: DuelSetup, s: DuelState): { a: DuelAction; t: DuelState; score: number } | null {
  let best: { a: DuelAction; t: DuelState; score: number } | null = null;
  for (const a of actions(setup, s)) {
    const t = step(setup, s, a, true);
    const score = turnScore(s, t);
    if (!best || score > best.score) best = { a, t, score };
  }
  return best;
}

/**
 * A player who reads the screen one turn ahead, from `lead`: each turn every Energy spot and every
 * move, wait and swap is tried and the one that does the most for the least (turnScore) is kept;
 * after a knockout it sends out the card whose first turn would score best. No plan beyond the turn.
 */
export function lookaheadPlay(setup: DuelSetup, lead: number, pick: number[] = smartBring(setup)): { won: boolean; turns: number; left: number } {
  const start = afterBring(setup, pick);
  if (!nexts(start.s).includes(lead)) return { won: false, turns: 0, left: 0 };
  let s = begin(setup, start.s, lead, true);
  while (!s.over) {
    const b = bestTurn(setup, s);
    if (!b) break;
    s = b.t;
    if (s.over) break;
    let nx: number | null = null;
    if (needsNext(s)) {
      let top = -Infinity;
      for (const i of nexts(s)) {
        const score = bestTurn(setup, begin(setup, s, i, true))?.score ?? -Infinity;
        if (nx === null || score > top) { top = score; nx = i; }
      }
    }
    s = begin(setup, s, nx, true);
  }
  return { won: s.over === "won", turns: s.turn, left: youLeft(s) };
}

/**
 * Professor's advice (Britton, 2026-10-22: "make sure the professor hints are actually useful"): a
 * play for this turn from where the duel stands. The first move of a winning line the search finds
 * from here (your conditions counted as misses, like par), else the one-turn look-ahead's best turn.
 * The search stops at ADVICE_NODES positions, so everyone at the same spot gets the same advice on
 * any machine (a clock limit gave two answers on 2026-10-22); `budgetMs` is only a safety net. Par
 * lines need up to about 47,000 positions from turn 1 (350ms on a laptop). A losing position still
 * gets the best turn on offer.
 */
export function adviceFor(setup: DuelSetup, s: DuelState, budgetMs = 2000): DuelHintView | null {
  if (s.over || s.yi < 0 || needsBring(setup, s) || needsNext(s)) return null;
  const plan = solverSetup(setup);
  const sol = solve(plan, { from: s, width: 120, maxNodes: ADVICE_NODES, deadline: Date.now() + budgetMs });
  const first = sol?.line.find((x): x is DuelAction => "attach" in x) ?? null;
  const found = first ?? bestTurn(plan, s)?.a ?? null;
  if (!found) return null;
  const turns = first && sol ? planTurns(plan, s, sol.line) : [];
  const a = plainEnergy(plan, s, found, turns);
  return { attach: a.attach, act: a.act, ...(a.use != null ? { use: a.use } : {}), text: hintText(setup, s, a, turns) };
}

/**
 * The search puts the Energy wherever it ties, so a spot the plan never uses would read as advice. Keep
 * it where it goes by default (your card on the field) unless the plan charges that card for a move,
 * the turn swaps that card in, or moving it changes how the turn goes.
 */
function plainEnergy(setup: DuelSetup, s: DuelState, a: DuelAction, turns: PlanTurn[]): DuelAction {
  if (a.attach === s.yi) return a;
  if (turns.some((p, i) => i > 0 && p.yi === a.attach && "move" in p.act)) return a;
  if ("swap" in a.act && a.act.swap === a.attach) return a;
  const alt: DuelAction = { attach: s.yi, act: a.act, ...(a.use != null ? { use: a.use } : {}) };
  if (!isLegal(setup, s, alt)) return a;
  return turnScore(s, step(setup, s, alt, true)) >= turnScore(s, step(setup, s, a, true)) ? alt : a;
}

const ADVICE_NODES = 60_000;

/** A winning line's turns from here: which card was on the field and what it did (for the advice's reasons). */
export interface PlanTurn { yi: number; attach: number; act: DuelAction["act"] }
function planTurns(setup: DuelSetup, s: DuelState, line: DuelStep[]): PlanTurn[] {
  const out: PlanTurn[] = [];
  let t: DuelState | null = s;
  for (const st of line) {
    if (!t) break;
    if ("attach" in st) out.push({ yi: t.yi, attach: st.attach, act: st.act });
    t = applyStep(setup, t, st);
  }
  return out;
}

/**
 * The advice in one sentence: where the Energy goes (when it isn't the card on the field) and what
 * for, then the turn and why. `plan` is the winning line's turns from here, when the search found
 * one: it says what the charged card will use and whether a card swapped in attacks or takes hits.
 */
export function hintText(setup: DuelSetup, s: DuelState, a: DuelAction, plan: PlanTurn[] = []): string {
  const foe = setup.foe[s.fi];
  const foeLeft = s.foe[s.fi].cur;
  let turn: string;
  if ("move" in a.act) {
    const att = setup.you[s.yi];
    const m = att.moves[a.act.move];
    const d = damageOf(s, att, foe, m, true);
    const why = d >= foeLeft ? ", a knockout" : foe.weak === att.t ? ", double damage" : "";
    turn = `use ${m.n}: ${d} to ${foe.short}${why}`;
  } else if ("swap" in a.act) {
    const c = setup.you[a.act.swap];
    const field = setup.you[s.yi];
    const fm = foeChoice(setup, s);
    const hit = fm >= 0 ? damageOf(s, foe, field, foe.moves[fm], false) : 0;
    // Its strongest move against the trainer's card, for the reason when nothing else says why.
    let best: { n: string; d: number } | null = null;
    for (const m of c.moves) { const d = damageOf(s, c, foe, m, true); if (!best || d > best.d) best = { n: m.n, d }; }
    // In the plan, does it attack next turn, or come in to take the hits?
    const after = plan[1];
    const tank = plan.length > 1 && !(after && after.yi === a.act.swap && "move" in after.act);
    const why = foe.weak === c.t ? `: ${foe.short} is weak to ${c.t}`
      : fm >= 0 && hit >= s.you[s.yi].cur ? `: ${field.short} wouldn't survive ${foe.moves[fm].n}`
      : tank ? ` to take ${foe.short}'s hits`
      : best && best.d > 0 ? `: its ${best.n} does ${best.d} to ${foe.short}${best.d >= foeLeft ? ", a knockout" : ""}`
      : "";
    turn = a.attach === a.act.swap ? (setup.hand ? `swap it in${why}` : `give ${c.short} the Energy and swap it in${why}`) : `swap in ${c.short}${why}`;
  } else {
    turn = "wait this turn and let the Energy build";
  }
  // The card the Energy goes to, and the move the plan charges it for. Rules 5: which Energy from the hand.
  let energy = "";
  const kind = setup.hand && s.hand?.length ? `the ${s.hand[a.use ?? 0]} Energy` : "the Energy";
  if (a.attach !== s.yi && !("swap" in a.act && a.act.swap === a.attach)) {
    const use = plan.find((p, i) => i > 0 && p.yi === a.attach && "move" in p.act);
    const card = setup.you[a.attach];
    energy = use && "move" in use.act
      ? (setup.hand ? `Charge ${card.short} with ${kind} for ${card.moves[use.act.move].n}, then ` : `Charge ${card.short} for ${card.moves[use.act.move].n}, then `)
      : `Put ${kind} on ${card.short}, then `;
  } else if (setup.hand) {
    energy = `Play ${kind} on ${setup.you[a.attach].short}, then `;
  }
  const text = `${energy}${turn}.`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Rules 5's stand-in for a person (picks 2026-10-22, https://claude.ai/artifact/MFwJQi5RBdq92B1JKS2EWZ):
 * each turn the best play a turn ahead (turnScore), or with chance `slip` the second best; after a
 * knockout the card whose first turn scores best, or with chance `slip` any. Deterministic for `rand`.
 */
export function slipPlay(setup: DuelSetup, s0: DuelState, lead: number, slip: number, rand: () => number): boolean {
  return slipGame(setup, s0, lead, slip, rand).over === "won";
}

/** The slipping player's whole duel (slipPlay), returning where it ended. */
export function slipGame(setup: DuelSetup, s0: DuelState, lead: number, slip: number, rand: () => number): DuelState {
  let s = begin(setup, s0, lead, true);
  let guard = 0;
  while (!s.over && guard++ < TURN_CAP + 5) {
    let best: { t: DuelState; score: number } | null = null;
    let second: { t: DuelState; score: number } | null = null;
    for (const a of actions(setup, s)) {
      const t = step(setup, s, a, true);
      const score = slipScore(setup, s, t) - ("swap" in a.act ? SWAP_COST : 0);
      if (!best || score > best.score) { second = best; best = { t, score }; }
      else if (!second || score > second.score) second = { t, score };
    }
    if (!best) break;
    s = (second && rand() < slip ? second : best).t;
    if (s.over) break;
    let nx: number | null = null;
    if (needsNext(s)) {
      const ns = nexts(s);
      if (rand() < slip) nx = ns[Math.floor(rand() * ns.length)];
      else {
        let top = -Infinity;
        for (const i of ns) {
          const score = bestTurn(setup, begin(setup, s, i, true))?.score ?? -Infinity;
          if (nx === null || score > top) { top = score; nx = i; }
        }
      }
    }
    s = begin(setup, s, nx, true);
  }
  return s;
}

/**
 * The slipping player's view of a turn: damage dealt (a knockout worth 200 more), less 0.8 of the HP
 * your cards lost, plus half of how much closer it leaves your cards to their best moves (readiness).
 * Unlike the lookahead player, losing a card costs only its HP: under rules 5 the next card comes back
 * charged, and with a knockout counted as 200 the player swapped every turn to dodge one, spreading the
 * damage. Without readiness a turn that deals no damage is a tie wherever the Energy goes, and the
 * player never charged anything.
 */
function slipScore(setup: DuelSetup, before: DuelState, after: DuelState): number {
  if (after.over === "won") return 1e6;
  if (after.over === "lost") return -1e6;
  let dealt = 0;
  let lost = 0;
  for (let i = 0; i < before.foe.length; i++) dealt += (before.foe[i].out ? 0 : before.foe[i].cur) - (after.foe[i].out ? -200 : after.foe[i].cur);
  for (let i = 0; i < before.you.length; i++) lost += (before.you[i].out ? 0 : before.you[i].cur) - (after.you[i].out ? 0 : after.you[i].cur);
  return dealt - 0.8 * lost + 0.5 * (readiness(setup, after) - readiness(setup, before));
}

/** For each of your cards still in, its best move against the trainer's card on the field times the square of the share of its cost already paid; the card on the field counts double. */
function readiness(setup: DuelSetup, s: DuelState): number {
  const def = s.fi >= 0 && !s.foe[s.fi]?.out ? setup.foe[s.fi] : null;
  if (!def) return 0;
  let v = 0;
  for (let i = 0; i < setup.you.length; i++) {
    const slot = s.you[i];
    if (slot.out || !inDuel(s, i)) continue;
    const c = setup.you[i];
    let best = 0;
    for (const m of c.moves) {
      const share = paidShare(slot.energy, m.cost);
      if (share > 0) best = Math.max(best, damageOf(s, c, def, m, true, { att: slot }) * share * share);
    }
    v += (i === s.yi ? 1 : 0.5) * best;
  }
  return v;
}

/** How much of a cost the Energy covers: colored needs met, then Colorless from what's left. */
function paidShare(energy: readonly EnergyType[], cost: readonly EnergyType[]): number {
  if (!cost.length) return 1;
  const left = energy.slice();
  let paid = 0;
  let colorless = 0;
  for (const t of cost) {
    if (t === "Colorless") { colorless++; continue; }
    const j = left.indexOf(t);
    if (j >= 0) { left.splice(j, 1); paid++; }
  }
  return (paid + Math.min(left.length, colorless)) / cost.length;
}

/** Rules 5: the share of duels a player who slips 30% of the time wins, over sensible picks of the cards to bring, every lead and a few seeds. */
export function slipWinRate(setup: DuelSetup, key: string, extra: number[][] = [], seeds = SLIP_SEEDS, slip = SLIP): number {
  const s0 = startState(setup);
  const picks = needsBring(setup, s0) ? uniquePicks([smartBring(setup), obviousBring(setup), ...extra]) : [null];
  let games = 0;
  let wins = 0;
  for (const pick of picks) {
    const sb = pick ? applyStep(setup, s0, { bring: pick })! : s0;
    for (const lead of nexts(sb)) {
      for (let k = 0; k < seeds; k++) {
        games++;
        if (slipPlay(setup, sb, lead, slip, duelRand(`slip:${key}:${pick?.join("") ?? "6"}:${lead}:${k}`))) wins++;
      }
    }
  }
  return games ? wins / games : 0;
}
const uniquePicks = (ps: number[][]) => ps.filter((p, i) => ps.findIndex((q) => q.join(",") === p.join(",")) === i);

/** What a swap costs the slipping player (a person swaps for a reason; without it the player swapped every turn and spread the damage). */
const SWAP_COST = 60;

/** How often the slipping player picks the second-best play, and the seeds per start. */
export const SLIP = 0.3;
export const SLIP_SEEDS = 4;

/**
 * Rules 5's targets (Britton's picks 2026-10-22): the share of duels the slipping player wins, about
 * 85% on Monday and Tuesday down to 55% on Sunday, with room either side.
 */
export const WIN_BAND: Record<DuelTier, [number, number]> = {
  gym: [0.75, 0.95],
  elite: [0.65, 0.88],
  rival: [0.6, 0.82],
  boss: [0.5, 0.72],
  champion: [0.45, 0.68],
};

/** One of the professor's plans: a different card carries each. */
export interface DuelPlan {
  /** "Grimmsnarl carries it". */
  title: string;
  /** One or two sentences: what to bring, who leads, how the carrying card comes in and what it does. */
  text: string;
  /** The carrying card (your card index) and the plan's turns (for ordering; never shown). */
  carry: number;
  turns: number;
}

/**
 * The professor's plans (rules 5): the par line first, then the best line with that plan's carrying
 * card left without moves (so it can't carry: "Leave X out" when you bring fewer than six), then
 * without both. Each later line is searched on that changed duel and kept only when it also wins the
 * real one. Up to `max`, fewest turns first; each search stops at a fixed number of positions, so the
 * same pack always gets the same plans.
 */
export function dayPlans(setup: DuelSetup, par: DuelSolution | null, max = 3): DuelPlan[] {
  return plansWithLines(setup, par, max).map((p) => p.plan);
}

/** dayPlans with each plan's winning line (a later plan can beat the par search: judge5 then takes it as par). */
function plansWithLines(setup: DuelSetup, par: DuelSolution | null, max = 3): { plan: DuelPlan; line: DuelStep[] }[] {
  const plan = solverSetup(setup);
  const out: { plan: DuelPlan; line: DuelStep[] }[] = [];
  const banned: number[] = [];
  for (let k = 0; k < max; k++) {
    const line = k === 0 && par ? par.line : lineWithout(plan, banned);
    if (!line) break;
    const story = storyOf(plan, line);
    if (!story || banned.includes(story.carry)) break;
    out.push({ plan: { title: `${setup.you[story.carry].short} carries it`, text: planText(setup, story), carry: story.carry, turns: story.turns }, line });
    banned.push(story.carry);
  }
  return out.sort((x, y) => x.plan.turns - y.plan.turns);
}

/**
 * The fewest-turns winning line the search finds when the `banned` cards have no moves (one search
 * over every pick and lead), checked on the real duel. On six-card days the second plan often needs
 * 150,000 to 400,000 positions (2026-10-22 sweep), so PLAN_NODES is 400,000: about 3 seconds.
 */
function lineWithout(plan: DuelSetup, banned: number[]): DuelStep[] | null {
  const off: DuelSetup = { ...plan, you: plan.you.map((c, i) => (banned.includes(i) ? { ...c, moves: [] } : c)) };
  const sol = solve(off, { width: 300, maxNodes: PLAN_NODES });
  return sol && winsReal(plan, sol.line) ? sol.line : null;
}

function winsReal(plan: DuelSetup, line: DuelStep[]): boolean {
  let s: DuelState | null = startState(plan);
  for (const st of line) {
    if (!s) return false;
    s = applyStep(plan, s, st);
  }
  return s?.over === "won";
}
const PLAN_NODES = 400_000;

interface LineStory { carry: number; move: string; kos: number; lead: number; pick: number[] | null; entered: "lead" | "swap" | "sent"; chargedFirst: boolean; turns: number; helper: number | null }

/** What a winning line does: who carries it (most damage), with what, how it comes in. */
function storyOf(setup: DuelSetup, line: DuelStep[]): LineStory | null {
  let s: DuelState | null = startState(setup);
  const dealt = new Map<number, number>();
  const kos = new Map<number, number>();
  const used = new Map<number, Map<string, number>>();
  const enter = new Map<number, "lead" | "swap" | "sent">();
  const energyBefore = new Map<number, number>();
  let pick: number[] | null = null;
  let lead = -1;
  for (const st of line) {
    if (!s) return null;
    if ("bring" in st) pick = st.bring;
    else if ("next" in st) { if (lead < 0) { lead = st.next; enter.set(st.next, "lead"); } else if (!enter.has(st.next)) enter.set(st.next, "sent"); }
    else {
      if (!enter.has(st.attach) && st.attach !== s.yi) energyBefore.set(st.attach, (energyBefore.get(st.attach) ?? 0) + 1);
      if ("swap" in st.act && !enter.has(st.act.swap)) enter.set(st.act.swap, "swap");
      if ("move" in st.act) {
        const who = s.yi;
        const fi = s.fi;
        const before = s.foe[fi].cur;
        const t = applyStep(setup, s, st);
        if (!t) return null;
        const d = before - (t.foe[fi].out ? 0 : t.foe[fi].cur);
        dealt.set(who, (dealt.get(who) ?? 0) + Math.max(0, d));
        if (t.foe[fi].out) kos.set(who, (kos.get(who) ?? 0) + 1);
        const name = setup.you[who].moves[st.act.move].n;
        const m = used.get(who) ?? new Map<string, number>();
        m.set(name, (m.get(name) ?? 0) + 1);
        used.set(who, m);
        s = t;
        continue;
      }
    }
    s = applyStep(setup, s, st);
  }
  if (!s || s.over !== "won") return null;
  const ranked = [...dealt.entries()].sort((a, b) => b[1] - a[1]);
  const carry = ranked[0]?.[0];
  if (carry == null) return null;
  const total = ranked.reduce((n, [, d]) => n + d, 0);
  const helper = ranked[1] && ranked[1][1] >= total * 0.3 ? ranked[1][0] : null;
  const move = [...(used.get(carry)?.entries() ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  return { carry, move, kos: kos.get(carry) ?? 0, lead, pick, entered: enter.get(carry) ?? "sent", chargedFirst: (energyBefore.get(carry) ?? 0) > 0, turns: s.turn, helper };
}

const NUM = ["no", "one", "two", "three", "four", "five", "six"];
/** A plan in plain words: what to bring (or leave out), who leads, how the carrying card comes in and what it does. */
function planText(setup: DuelSetup, p: LineStory): string {
  const name = (i: number) => setup.you[i].short;
  const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  const parts: string[] = [];
  if (p.pick) {
    const out = setup.you.map((_, i) => i).filter((i) => !p.pick!.includes(i));
    parts.push(out.length <= 2 ? `Leave ${list(out.map(name))} out.` : `Bring ${list(p.pick.map(name))}.`);
  }
  const ko = p.kos > 0 ? `${p.move} knocks out ${NUM[p.kos] ?? p.kos}` : `${p.move} does the work`;
  const carry = name(p.carry);
  if (p.entered === "lead") parts.push(`Lead with ${carry}: ${ko}.`);
  else if (p.entered === "swap") parts.push(`Lead with ${name(p.lead)}${p.chargedFirst ? ` while ${carry} charges` : ""}, then swap ${carry} in: ${ko}.`);
  else parts.push(`Lead with ${name(p.lead)} to take the first hits${p.chargedFirst ? ` while ${carry} charges` : ""}, then send in ${carry}: ${ko}.`);
  if (p.helper != null && p.helper !== p.carry) parts.push(`${name(p.helper)} helps with the damage.`);
  return parts.join(" ");
}

/**
 * How many leads the lookahead player wins from: of the six, or under rules 4 with the best of a few
 * sensible picks of the cards to bring (the matchup pick, the hardest hitters, and `extra`, e.g. the
 * par line's own pick).
 */
export function fairLeads(setup: DuelSetup, extra: number[][] = []): number {
  const picks = needsBring(setup, startState(setup)) ? [smartBring(setup), obviousBring(setup), ...extra] : [smartBring(setup)];
  let best = 0;
  const seen = new Set<string>();
  for (const pick of picks) {
    const key = pick.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    let n = 0;
    for (const i of nexts(afterBring(setup, pick).s)) if (lookaheadPlay(setup, i, pick).won) n++;
    best = Math.max(best, n);
  }
  return best;
}

/** Leads the lookahead player must win from: hard but findable, two on the easy gym days. */
export const FAIR_LEADS: Record<DuelTier, number> = { gym: 2, elite: 1, rival: 1, boss: 1, champion: 1 };

// ─── building a day ──────────────────────────────────────────────────────────

/**
 * The engine's setup for a day: the pack and the trainer's team as cards. Null if a card is missing.
 * `rules` 2 plays conditions, rolled from `seed` (the day).
 */
export function makeSetup(
  cards: Readonly<Record<string, DuelCard>>, trainer: DuelTrainer, pack: readonly string[], row: EnergyType[], events: DuelEventAt[],
  opts: { rules?: DuelRules; seed?: string } = {},
): DuelSetup | null {
  const you = pack.map((id) => cards[id]);
  const foe = trainer.team.map((id) => cards[id]).filter(Boolean);
  if (you.some((c) => !c) || foe.length < 1) return null;
  const setup: DuelSetup = { you, foe, row, events, signature: trainer.signature.effect, trainer: trainer.name };
  if (opts.rules && opts.rules >= 2) { setup.rules = opts.rules; setup.seed = opts.seed ?? ""; }
  if (opts.rules && opts.rules >= 4) {
    // You bring as many as the trainer (at least 3); a short team's cards start with Energy.
    const bring = Math.min(you.length, Math.max(3, foe.length));
    if (bring < you.length) setup.bring = bring;
    const head = Math.min(3, Math.max(0, HEAD_START_FROM - foe.length));
    if (head > 0) setup.foeHead = head;
  }
  if (opts.rules && opts.rules >= 5) {
    // A hand of three Energy, and a charged comeback after a knockout (up to 2).
    setup.hand = HAND_SIZE;
    setup.comeback = COMEBACK_MAX;
    if (opts.rules >= 6) {
      // Rules 6: the trainer plays by the same rules (its own hand from its own row, the comeback charge).
      setup.foeHand = HAND_SIZE;
      setup.foeRow = foeRowFor(setup.foe, `${opts.seed ?? ""}:foe`);
      setup.foeComeback = COMEBACK_MAX;
    }
  } else {
    // "+" and "×" attacks play their text from rules 5; older days play the printed number.
    const plain = (c: DuelCard): DuelCard => (c.moves.some((m) => m.plus) ? { ...c, moves: c.moves.map((m) => ({ n: m.n, cost: m.cost, d: m.d, ...(m.fx ? { fx: m.fx } : {}) })) } : c);
    setup.you = setup.you.map(plain);
    setup.foe = setup.foe.map(plain);
  }
  return setup;
}

/** Rules 5: the Energy you hold, and the most a card brings back after a knockout. */
export const HAND_SIZE = 3;
export const COMEBACK_MAX = 2;

/**
 * Rules 4: a trainer's cards start with an Energy for each card its team is short of five (up to 3:
 * a 2-card team's cards start with 3). Britton picked "short of six"; with you bringing as many as the
 * trainer that made 4- and 5-card teams unwinnable for many packs (8 of 28 days fell to a stand-in in
 * the 2026-10-22 sweep), so it counts from five: 5-card teams get none, as the gap it makes up for is
 * the bring rule's own.
 */
export const HEAD_START_FROM = 5;

/** The same duel as the solver plays it: your conditions never land (rules 2), so par never counts on luck. */
export const solverSetup = (setup: DuelSetup): DuelSetup => ((setup.rules ?? 1) >= 2 ? { ...setup, luck: "miss" } : setup);

/**
 * Hard (picks 2026-10-23, https://claude.ai/artifact/BFhLK47XrGwhsJdGSvXSP6): the same duel without your
 * comeback Energy (the trainer keeps theirs). The professor is off too, which the store handles.
 */
export const hardSetup = (setup: DuelSetup): DuelSetup => ({ ...setup, comeback: 0 });

/** How far Hard's par search looks before the slipping player's wins are asked instead. */
export const HARD_NODES = 400_000;

/**
 * Hard's par: the fewest turns the search finds (your conditions as misses, like Normal's par). When
 * the search runs out of room, the slipping player's quickest win over every pick, lead and seed shows
 * a winning line exists and stands as par. 0 = no winning line found: Hard is off that day.
 */
export function hardParFor(setup: DuelSetup, nodes = HARD_NODES): number {
  const hard = hardSetup(setup);
  const sol = solve(solverSetup(hard), { width: 300, maxNodes: nodes });
  if (sol) return sol.par;
  const s0 = startState(hard);
  const picks = needsBring(hard, s0) ? uniquePicks([smartBring(hard), obviousBring(hard)]) : [null];
  let best = 0;
  for (const pick of picks) {
    const sb = pick ? applyStep(hard, s0, { bring: pick })! : s0;
    for (const lead of nexts(sb)) {
      for (let k = 0; k < SLIP_SEEDS * 2; k++) {
        const end = slipGame(hard, sb, lead, SLIP, duelRand(`hard:${pick?.join("") ?? "6"}:${lead}:${k}`));
        if (end.over === "won" && (!best || end.turn < best)) best = end.turn;
      }
    }
  }
  return best;
}

/** How many ex cards a pack may hold, by tier (never more than 2). */
export const MAX_EX: Record<DuelTier, number> = { gym: 1, elite: 1, rival: 2, boss: 2, champion: 2 };

/**
 * Where a tier's strength cap starts: pack cards may hit up to this much harder than the team's
 * hardest hitter, and have this much more HP than its biggest card. Light teams (the Kanto gym
 * leaders' 2000-era cards) get cards of their own weight; a champion's big team leaves the pool open.
 */
export const START_SLACK: Record<DuelTier, number> = { gym: 20, elite: 30, rival: 40, boss: 50, champion: 60 };

/** The strength cap for a team: its hardest hit and its biggest HP, plus `slack`. */
export function packCap(team: readonly DuelCard[], slack: number): { damage: number; hp: number } {
  let damage = 0;
  let hp = 0;
  for (const c of team) { damage = Math.max(damage, topDamage(c)); hp = Math.max(hp, c.hp); }
  return { damage: damage + slack, hp: hp + slack };
}

/** A pack needs this many cards to choose from (after the cap); a thinner pool widens the cap. */
const MIN_CANDIDATES = 30;

/** The pool cards that may be dealt: playable, not the trainer's own, inside the cap. */
export function candidates(pool: readonly string[], cards: Readonly<Record<string, DuelCard>>, exclude: ReadonlySet<string>, cap?: { damage: number; hp: number }): string[] {
  return pool.filter((id) => {
    const c = cards[id];
    if (!c || !c.moves.length || exclude.has(id)) return false;
    return !cap || (topDamage(c) <= cap.damage && c.hp <= cap.hp);
  });
}

/**
 * Six random cards from these candidates: six different species, at most `maxEx` ex cards (2 at
 * most), at least 3 different types (and at least 2 that aren't Colorless). Pool order matters only
 * for days not built yet: a built day keeps its own copy of its cards.
 */
export const hasCondition = (c: DuelCard) => c.moves.some((m) => !!m.fx?.length);

/**
 * `needFx` (rules 3): the six must hold at least one card with a condition move; when these
 * candidates can't give one in 40 tries, any six will do.
 */
export function drawPack(ids: readonly string[], cards: Readonly<Record<string, DuelCard>>, rand: () => number, maxEx = 2, needFx = false): string[] | null {
  for (let tries = 0; tries < 40; tries++) {
    const pick: string[] = [];
    const species = new Set<string>();
    let ex = 0;
    for (const id of shuffleWith(ids, rand)) {
      const c = cards[id];
      const sp = speciesOf(c);
      if (species.has(sp) || (c.ex && ex >= Math.min(2, maxEx))) continue;
      pick.push(id);
      species.add(sp);
      if (c.ex) ex++;
      if (pick.length === 6) break;
    }
    if (pick.length < 6) return null;
    const types = new Set(pick.map((id) => cards[id].t));
    const colored = [...types].filter((t) => t !== "Colorless").length;
    if (types.size < 3 || colored < 2) continue;
    if (needFx && !pick.some((id) => hasCondition(cards[id]))) continue;
    return pick;
  }
  return needFx ? drawPack(ids, cards, rand, maxEx) : null;
}

export interface DuelDayBuild {
  day: string;
  number: number;
  tier: DuelTier;
  trainerId: string;
  pack: string[];
  row: EnergyType[];
  events: DuelEventAt[];
  par: number;
  line: DuelStep[];
  /** Packs tried in all, and whether the par landed inside the tier's band (false: the closest one found). */
  attempts: number;
  inBand: boolean;
  /** The rotation's trainer gave no puzzle (the obvious play beat every pack), so this is the next one in the tier. */
  stoodIn: boolean;
  /** The strength cap's slack the pack was drawn with. */
  slack: number;
  /** The obvious play's turns (it lost). */
  obviousTurns: number;
  /** Leads the lookahead player wins from (FAIR_LEADS asks for at least 1, 2 on gym days; 0 only when no pack anywhere passed). Rules 5 judges by the slipping player instead and leaves it 0. */
  fair: number;
  /** The rules it was built with (types.ts DuelRules). */
  rules: DuelRules;
  /** Rules 5: the share of duels the slipping player wins (WIN_BAND), and the professor's plans. */
  winRate?: number;
  plans?: DuelPlan[];
  ms: number;
}

type Found = Omit<DuelDayBuild, "attempts" | "ms" | "inBand" | "stoodIn">;

/**
 * Rules 5's checks on one pack, cheapest first: the slipping player's share of wins lands near the
 * weekday's target (WIN_BAND; a pack more than RATE_SLACK off is thrown out before the par search,
 * which is most of the cost); the solver wins; the obvious play doesn't reach par; par sits in the
 * tier's band; and, only for packs that pass all that, at least two plans with different cards
 * carrying them. "easy" or "hard" throws the pack out; otherwise `miss` says how far it is from passing
 * (0 = passes), so the closest pack can stand when none passes.
 */
function judge5(
  setup: DuelSetup, obvious: { won: boolean; turns: number }, tier: DuelTier, key: string, width: number | undefined, deadline: number,
): "easy" | "hard" | { sol: DuelSolution; rate: number; plans: DuelPlan[]; miss: number; lean: "easy" | "hard" } {
  const [wlo, whi] = WIN_BAND[tier];
  const rate = slipWinRate(setup, key);
  if (rate > whi + RATE_SLACK) return "easy";
  if (rate < wlo - RATE_SLACK) return "hard";
  const plan = solverSetup(setup);
  const sol = solve(plan, { width, deadline });
  if (!sol) return "hard";
  if (obvious.won && obvious.turns <= sol.par) return "easy";
  const [lo, hi] = PAR_BAND[tier];
  const parMiss = sol.par < lo ? lo - sol.par : sol.par > hi ? sol.par - hi : 0;
  // A tenth of the win share counts as one turn of par miss.
  const rateMiss = rate < wlo ? (wlo - rate) * 10 : rate > whi ? (rate - whi) * 10 : 0;
  const lean = rate > whi || sol.par < lo ? "easy" : "hard";
  if (parMiss > 3) return lean;
  if (parMiss > 0 || rateMiss > 0) return { sol, rate, plans: [], miss: parMiss + rateMiss + 1, lean };
  const found = plansWithLines(setup, sol);
  const plans = found.map((p) => p.plan);
  // The par search is a beam search: a plan's own search can find a faster win. Then that's par.
  if (found[0] && found[0].plan.turns < sol.par) {
    const quick: DuelSolution = { par: found[0].plan.turns, line: found[0].line, nodes: sol.nodes };
    if (obvious.won && obvious.turns <= quick.par) return "easy";
    const miss2 = quick.par < lo ? lo - quick.par : 0;
    return { sol: quick, rate, plans, miss: miss2 + (plans.length >= MIN_PLANS ? 0 : 1), lean: miss2 ? "easy" : lean };
  }
  return { sol, rate, plans, miss: plans.length >= MIN_PLANS ? 0 : 1, lean };
}

/** How far off the weekday's target a pack's win share may be before the par search is skipped. */
const RATE_SLACK = 0.15;

/** Rules 5: plans a day needs (Britton's picks 2026-10-22: at least two ways to win). */
export const MIN_PLANS = 2;

/**
 * Packs for one trainer: drawn under a strength cap that tightens while the obvious play keeps
 * winning and loosens while nothing can be won. Stops at the first in-band pack; else returns the
 * beatable pack whose par came closest to the band.
 */
export function packsFor(
  day: string, trainer: DuelTrainer, tier: DuelTier, pool: readonly string[], cards: Readonly<Record<string, DuelCard>>,
  seed: string, attempts: number, deadline: number, width: number | undefined, count: { n: number }, needFair = 0, rules: DuelRules = 1,
): { found: Found; inBand: boolean } | null {
  const [lo, hi] = PAR_BAND[tier];
  const team = trainer.team.map((id) => cards[id]).filter(Boolean);
  const exclude = new Set(trainer.team);
  let slack = START_SLACK[tier];
  let fallback: { found: Found; miss: number; setup?: DuelSetup } | null = null;
  let tooEasy = 0;
  let tooHard = 0;
  for (let attempt = 0; attempt < attempts && Date.now() < deadline; attempt++) {
    count.n++;
    // Every 6 packs: weaker cards while the obvious play wins, stronger while nothing can be won.
    if (attempt > 0 && attempt % 6 === 0) {
      if (tooEasy >= 4) slack -= 20;
      else if (tooHard >= 4) slack += 30;
      tooEasy = 0;
      tooHard = 0;
    }
    let ids = candidates(pool, cards, exclude, packCap(team, slack));
    for (let widen = 0; ids.length < MIN_CANDIDATES && widen < 20; widen++) {
      slack += 20;
      ids = candidates(pool, cards, exclude, packCap(team, slack));
    }
    const rand = duelRand(`duel:${day}:${seed}:${trainer.id}:${attempt}`);
    const pack = drawPack(ids, cards, rand, MAX_EX[tier], rules >= 3);
    if (!pack) break;
    const row = energyRow(pack.map((id) => cards[id]), rand);
    const events = eventPlan(rand);
    const setup = makeSetup(cards, trainer, pack, row, events, { rules, seed: day });
    if (!setup) continue;
    const obvious = obviousPlay(setup);
    if (rules >= 5) {
      const got = judge5(setup, obvious, tier, `${day}:${seed}:${trainer.id}:${attempt}`, width, deadline);
      if (got === "easy") { tooEasy++; continue; }
      if (got === "hard") { tooHard++; continue; }
      const found: Found = { day, number: duelNumber(day), tier, trainerId: trainer.id, pack, row, events, par: got.sol.par, line: got.sol.line, slack, obviousTurns: obvious.turns, fair: 0, rules, winRate: got.rate, plans: got.plans };
      if (got.miss === 0) return { found, inBand: true };
      if (got.lean === "easy") tooEasy++;
      else tooHard++;
      if (!fallback || got.miss < fallback.miss) fallback = { found, miss: got.miss, setup };
      continue;
    }
    if (obvious.won) { tooEasy++; continue; }
    const sol = solve(solverSetup(setup), { width, deadline });
    if (!sol) { tooHard++; continue; }
    // Findable: a player reading one turn ahead has to win from enough leads.
    const parPick = sol.line[0] && "bring" in sol.line[0] ? [sol.line[0].bring] : [];
    const fair = fairLeads(solverSetup(setup), parPick);
    if (fair < needFair) { tooHard++; continue; }
    const found: Found = { day, number: duelNumber(day), tier, trainerId: trainer.id, pack, row, events, par: sol.par, line: sol.line, slack, obviousTurns: obvious.turns, fair, rules };
    if (sol.par >= lo && sol.par <= hi) return { found, inBand: true };
    if (sol.par < lo) tooEasy++;
    else tooHard++;
    const miss = sol.par < lo ? lo - sol.par : sol.par - hi;
    if (!fallback || miss < fallback.miss) fallback = { found, miss };
  }
  if (!fallback) return null;
  // Rules 5: the closest pack still gets its plans (they're only worked out for packs on target).
  if (fallback.setup && !fallback.found.plans?.length) {
    const f = fallback.found;
    const found = plansWithLines(fallback.setup, { par: f.par, line: f.line, nodes: 0 });
    const quick = found[0] && found[0].plan.turns < f.par ? found[0] : null;
    fallback.found = { ...f, plans: found.map((p) => p.plan), ...(quick ? { par: quick.plan.turns, line: quick.line } : {}) };
  }
  return { found: fallback.found, inBand: false };
}

/**
 * Builds a day: the trainer by rotation, then packs drawn at random (seeded by day, seed, trainer
 * and attempt) until one is beatable, the obvious play loses, the lookahead player wins from enough
 * leads (FAIR_LEADS), and the par sits in the tier's band.
 * When the attempts run out, the beatable pack whose par came closest to the band. A trainer with
 * no beatable pack at all that the obvious play loses (a very light team) hands the day to other
 * people of its tier (each with their first team), in a seeded order, leaving out anyone the
 * rotation puts on a day less than a week away (rules.ts peopleNear). Null when nothing works (or
 * there's no trainer).
 *
 * Deterministic for the same inputs as long as the time budget doesn't cut it short (the stored
 * day is the truth either way).
 */
export function buildDay(
  day: string,
  pool: readonly string[],
  cards: Readonly<Record<string, DuelCard>>,
  trainers: readonly DuelTrainer[],
  seed = "",
  opts: { attempts?: number; budgetMs?: number; width?: number; standIns?: number; rules?: DuelRules } = {},
): DuelDayBuild | null {
  const t0 = Date.now();
  const deadline = t0 + (opts.budgetMs ?? 60_000);
  // Rules 4 makes a few trainers hard to fit (Poppy, Lance): more packs before a stand-in; rules 5's
  // targets more still.
  const rules = opts.rules ?? 1;
  const attempts = opts.attempts ?? (rules >= 5 ? 120 : rules >= 4 ? 72 : 36);
  const first = trainerFor(day, trainers);
  if (!first) return null;
  const tier = tierFor(day);
  // Stand-ins keep the week guard: nobody the rotation puts on a day less than a week away.
  const near = peopleNear(day, trainers);
  const rest = peopleOf(trainers.filter((t) => t.tier === first.tier && personOf(t) !== personOf(first)));
  const free = rest.filter((p) => !near.has(p.person));
  const others = shuffleWith((free.length ? free : rest).map((p) => p.teams[0]), duelRand(`duel-stand-in:${day}`));
  const order = [first, ...others.slice(0, opts.standIns ?? 4)];
  const count = { n: 0 };
  // Findable packs first (FAIR_LEADS); only when no trainer in the order has one, any beatable pack.
  // Rules 5 judges packs by the slipping player instead (judge5), so one pass.
  // Rules 5: a pack off target from the rotation's trainer waits while the stand-ins try for one on
  // target, and stands if none has one.
  let closest: DuelDayBuild | null = null;
  for (const needFair of rules >= 5 ? [1] : [FAIR_LEADS[tier], 0]) {
    for (const [i, trainer] of order.entries()) {
      if (Date.now() >= deadline) break;
      // The rotation's trainer gets at most half the time left, so a stand-in still gets a turn.
      const own = i === 0 && needFair > 0 ? Date.now() + (deadline - Date.now()) / 2 : deadline;
      const got = packsFor(day, trainer, tier, pool, cards, seed, attempts, own, opts.width, count, needFair, rules);
      if (!got) continue;
      const build = { ...got.found, attempts: count.n, inBand: got.inBand, stoodIn: i > 0, ms: Date.now() - t0 };
      if (rules < 5 || got.inBand) return build;
      closest ??= build;
    }
  }
  return closest ? { ...closest, attempts: count.n, ms: Date.now() - t0 } : null;
}
