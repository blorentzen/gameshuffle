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
 */

import {
  actions, begin, damageOf, needsNext, nexts, startState, step, topDamage,
  TURN_CAP, type DuelSetup, type DuelState,
} from "./engine";
import { PAR_BAND, duelNumber, duelRand, energyRow, eventPlan, peopleNear, peopleOf, personOf, shuffleWith, speciesOf, tierFor, trainerFor } from "./rules";
import type { DuelAction, DuelCard, DuelEventAt, DuelStep, DuelTier, DuelTrainer, EnergyType } from "./types";

// ─── the search ──────────────────────────────────────────────────────────────

interface Node { s: DuelState; prev: Node | null; steps: DuelStep[]; score: number }

const CODE: Record<EnergyType, string> = { Grass: "g", Fire: "r", Water: "w", Lightning: "l", Psychic: "p", Fighting: "f", Darkness: "d", Metal: "m", Dragon: "n", Colorless: "c" };

/** A position's identity: two ways of reaching the same position are one. Energy order doesn't matter. */
function keyOf(s: DuelState): string {
  const f = s.fx;
  let k = `${s.yi}.${s.fi}.${f.weather ?? "-"}${f.weatherLeft}.${f.crit ? 1 : 0}${f.confused ? 1 : 0}${f.aceYou ? 1 : 0}.${f.sleep}.${f.aceFoe}.${f.boost}.${f.rocket}${f.rocketLeft}`;
  for (const c of s.you) {
    if (c.out) { k += "|x"; continue; }
    k += `|${c.cur}:`;
    k += c.energy.length > 1 ? c.energy.map((e) => CODE[e]).sort().join("") : c.energy.length ? CODE[c.energy[0]] : "";
  }
  // The trainer's Energy follows a fixed rule, so for the same card the count says it all.
  for (const c of s.foe) k += c.out ? "|x" : `|${c.cur}:${c.energy.length}`;
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
    if (c.out) continue;
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
 * with null. Deterministic: the same setup and width always give the same answer.
 */
export function solve(setup: DuelSetup, opts: { width?: number; deadline?: number; score?: (setup: DuelSetup, s: DuelState) => number } = {}): DuelSolution | null {
  const width = opts.width ?? 300;
  const deadline = opts.deadline ?? Infinity;
  const scoreOf = opts.score ? (s: DuelState) => opts.score!(setup, s) : (s: DuelState) => scoreState(setup, s);
  const s0 = startState(setup);
  let nodes = 0;
  let frontier: Node[] = nexts(s0).map((i) => {
    const s = begin(setup, s0, i, true);
    return { s, prev: null, steps: [{ next: i }], score: scoreOf(s) };
  });
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
      if ((i & 15) === 0 && Date.now() > deadline) return null;
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

/** The obvious play from the start: does it win, and in how many turns. */
export function obviousPlay(setup: DuelSetup): { won: boolean; turns: number; line: DuelStep[] } {
  let lead = 0;
  for (let i = 1; i < setup.you.length; i++) if (topDamage(setup.you[i]) > topDamage(setup.you[lead])) lead = i;
  const line: DuelStep[] = [{ next: lead }];
  let s = begin(setup, startState(setup), lead, true);
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
export function lookaheadPlay(setup: DuelSetup, lead: number): { won: boolean; turns: number } {
  let s = begin(setup, startState(setup), lead, true);
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
  return { won: s.over === "won", turns: s.turn };
}

/** How many of the six leads the lookahead player wins from. */
export function fairLeads(setup: DuelSetup): number {
  let n = 0;
  for (let i = 0; i < setup.you.length; i++) if (lookaheadPlay(setup, i).won) n++;
  return n;
}

/** Leads the lookahead player must win from: hard but findable, two on the easy gym days. */
export const FAIR_LEADS: Record<DuelTier, number> = { gym: 2, elite: 1, rival: 1, boss: 1, champion: 1 };

// ─── building a day ──────────────────────────────────────────────────────────

/** The engine's setup for a day: the pack and the trainer's team as cards. Null if a card is missing. */
export function makeSetup(cards: Readonly<Record<string, DuelCard>>, trainer: DuelTrainer, pack: readonly string[], row: EnergyType[], events: DuelEventAt[]): DuelSetup | null {
  const you = pack.map((id) => cards[id]);
  const foe = trainer.team.map((id) => cards[id]).filter(Boolean);
  if (you.some((c) => !c) || foe.length < 1) return null;
  return { you, foe, row, events, signature: trainer.signature.effect, trainer: trainer.name };
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
export function drawPack(ids: readonly string[], cards: Readonly<Record<string, DuelCard>>, rand: () => number, maxEx = 2): string[] | null {
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
    if (types.size >= 3 && colored >= 2) return pick;
  }
  return null;
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
  /** Leads the lookahead player wins from (FAIR_LEADS asks for at least 1, 2 on gym days; 0 only when no pack anywhere passed). */
  fair: number;
  ms: number;
}

type Found = Omit<DuelDayBuild, "attempts" | "ms" | "inBand" | "stoodIn">;

/**
 * Packs for one trainer: drawn under a strength cap that tightens while the obvious play keeps
 * winning and loosens while nothing can be won. Stops at the first in-band pack; else returns the
 * beatable pack whose par came closest to the band.
 */
export function packsFor(
  day: string, trainer: DuelTrainer, tier: DuelTier, pool: readonly string[], cards: Readonly<Record<string, DuelCard>>,
  seed: string, attempts: number, deadline: number, width: number | undefined, count: { n: number }, needFair = 0,
): { found: Found; inBand: boolean } | null {
  const [lo, hi] = PAR_BAND[tier];
  const team = trainer.team.map((id) => cards[id]).filter(Boolean);
  const exclude = new Set(trainer.team);
  let slack = START_SLACK[tier];
  let fallback: { found: Found; miss: number } | null = null;
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
    const pack = drawPack(ids, cards, rand, MAX_EX[tier]);
    if (!pack) break;
    const row = energyRow(pack.map((id) => cards[id]), rand);
    const events = eventPlan(rand);
    const setup = makeSetup(cards, trainer, pack, row, events);
    if (!setup) continue;
    const obvious = obviousPlay(setup);
    if (obvious.won) { tooEasy++; continue; }
    const sol = solve(setup, { width, deadline });
    if (!sol) { tooHard++; continue; }
    // Findable: a player reading one turn ahead has to win from enough leads.
    const fair = fairLeads(setup);
    if (fair < needFair) { tooHard++; continue; }
    const found: Found = { day, number: duelNumber(day), tier, trainerId: trainer.id, pack, row, events, par: sol.par, line: sol.line, slack, obviousTurns: obvious.turns, fair };
    if (sol.par >= lo && sol.par <= hi) return { found, inBand: true };
    if (sol.par < lo) tooEasy++;
    else tooHard++;
    const miss = sol.par < lo ? lo - sol.par : sol.par - hi;
    if (!fallback || miss < fallback.miss) fallback = { found, miss };
  }
  return fallback ? { found: fallback.found, inBand: false } : null;
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
  opts: { attempts?: number; budgetMs?: number; width?: number; standIns?: number } = {},
): DuelDayBuild | null {
  const t0 = Date.now();
  const deadline = t0 + (opts.budgetMs ?? 60_000);
  const attempts = opts.attempts ?? 36;
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
  for (const needFair of [FAIR_LEADS[tier], 0]) {
    for (const [i, trainer] of order.entries()) {
      if (Date.now() >= deadline) break;
      const got = packsFor(day, trainer, tier, pool, cards, seed, attempts, deadline, opts.width, count, needFair);
      if (got) return { ...got.found, attempts: count.n, inBand: got.inBand, stoodIn: i > 0, ms: Date.now() - t0 };
    }
  }
  return null;
}
