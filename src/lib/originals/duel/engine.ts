/**
 * Daily Duel: the engine (pure, deterministic, client-safe). Picks 2026-10-21,
 * https://claude.ai/artifact/5fdauqQ8MPof41oWXYcuPk; ported from the mockup's engine.js with real
 * Energy only.
 *
 * A duel is a setup (your six cards, the trainer's team, the day's Energy row and events) plus a
 * state (HP, Energy, who's on the field, what's in play). The state is plain JSON, so the server
 * stores it as is; only the dynamic parts live in it (cards come from the setup), which keeps
 * copies cheap for the solver.
 *
 * Turn by turn:
 *   1. begin: the turn number goes up, this turn's Energy comes off the row, and the turn's event
 *      (if any) flips.
 *   2. you: the Energy goes on one of your cards (field or waiting; it stays there), then one of:
 *      a move of your card on the field (usable when its Energy covers the cost), a swap, or wait.
 *   3. the trainer: its card on the field gets one Energy (the type its best move still needs,
 *      else its own type) and uses the strongest move it can.
 *   4. end of turn: sand, weather counting down, the turn cap.
 * When one of your cards is knocked out you pick the next before the next turn begins (`next`).
 * Weakness doubles damage; nothing else changes it but the events. No coin flips anywhere.
 */

import { eventCopy } from "./copy";
import type { DuelAction, DuelCard, DuelEventAt, DuelEventKind, DuelMove, DuelSignature, DuelStep, DuelTrainer, EnergyType } from "./types";
import type { DuelCardView, DuelEventView, DuelPlayView } from "./view";

/** Turn 40 ends a duel that isn't won: a loss. */
export const TURN_CAP = 40;
export const WEATHER_TURNS = 3;
export const ROCKET_TURNS = 2;

export interface DuelSetup {
  /** Your six cards, in pack order. */
  you: DuelCard[];
  /** The trainer's team in order (the first leads). */
  foe: DuelCard[];
  /** The day's Energy row: your turn N places row[N - 1]. */
  row: EnergyType[];
  /** The day's events, by turn (one per turn at most). */
  events: DuelEventAt[];
  signature: DuelSignature;
  /** The trainer's name, for log lines ("Cynthia"). */
  trainer: string;
}

export interface DuelSlot {
  cur: number;
  energy: EnergyType[];
  out: boolean;
}

/** What's in play. */
export interface DuelFx {
  weather: "rain" | "sun" | "sand" | null;
  /** Turns of weather left, counting the current one. */
  weatherLeft: number;
  /** Your next move does half again as much. */
  crit: boolean;
  /** Your next move does half. */
  confused: boolean;
  /** The trainer's card (by index) that skips its next move: asleep. -1 for none. */
  sleep: number;
  /** The trainer's card (by index) that skips its next move: a stubborn ace. -1 for none. */
  aceFoe: number;
  /** Your card on the field is a stubborn ace this turn: no moves. */
  aceYou: boolean;
  /** The trainer's next move does this much more (its signature, boost30). */
  boost: number;
  /** The waiting card Team Rocket has (-1 for none) and the turns left. */
  rocket: number;
  rocketLeft: number;
  /** Professor's advice this turn: the view shows the trainer's next move. */
  advice: boolean;
}

export type DuelLogKind = "move" | "ko" | "out" | "swap" | "wait" | "event" | "skip" | "sand" | "heal" | "revive" | "energy";

export interface DuelLogLine {
  kind: DuelLogKind;
  /** Whose card it's about (null for the event itself). */
  side: "you" | "foe" | null;
  text: string;
  /** The card's index on its side. */
  card?: number;
  damage?: number;
  weak?: boolean;
  /** A move line: the move's name. */
  move?: string;
  /** An Energy line: the type that went on. */
  type?: EnergyType;
  /** A skip line: why the card skipped its move. */
  why?: "asleep" | "stubborn";
  /** A heal line: HP actually healed (0 on a card already at full HP). */
  amount?: number;
  /** The turn's event this line came from (lines written when the event flipped). */
  ev?: DuelEventKind;
}
// The optional fields above were added after the first duels were stored: pages read old lines
// without them (falling back to the text), and none of them change a result.

export interface DuelState {
  /** Your turn number: 0 before the lead goes out, 1 on the first turn. */
  turn: number;
  you: DuelSlot[];
  foe: DuelSlot[];
  /** Your card on the field (-1 before the lead), and the trainer's. */
  yi: number;
  fi: number;
  /** This turn's Energy, until it's placed (null between turns). */
  pending: EnergyType | null;
  fx: DuelFx;
  /** The event that flipped at the start of this turn. */
  event: DuelEventKind | null;
  over: "won" | "lost" | null;
  /** What happened on the last turn (and this turn's event). */
  log: DuelLogLine[];
}

const r10 = (x: number) => Math.round(x / 10) * 10;
/** Only ever at least 10 left: sand and a wild Pokémon never knock out. */
const chip = (cur: number, n: number) => (cur <= 10 ? cur : Math.max(10, cur - n));

const NO_FX: DuelFx = { weather: null, weatherLeft: 0, crit: false, confused: false, sleep: -1, aceFoe: -1, aceYou: false, boost: 0, rocket: -1, rocketLeft: 0, advice: false };

/** A fresh duel: nobody on the field yet (pick the lead with { next }). */
export function startState(setup: DuelSetup): DuelState {
  const slot = (c: DuelCard): DuelSlot => ({ cur: c.hp, energy: [], out: false });
  return { turn: 0, you: setup.you.map(slot), foe: setup.foe.map(slot), yi: -1, fi: 0, pending: null, fx: { ...NO_FX }, event: null, over: null, log: [] };
}

const copySlot = (c: DuelSlot): DuelSlot => ({ cur: c.cur, energy: c.energy.slice(), out: c.out });

/** A copy safe to change (structured, not a JSON round trip: the solver makes a lot of these). The log starts empty. */
export function cloneState(s: DuelState): DuelState {
  return { turn: s.turn, you: s.you.map(copySlot), foe: s.foe.map(copySlot), yi: s.yi, fi: s.fi, pending: s.pending, fx: { ...s.fx }, event: s.event, over: s.over, log: [] };
}

// ─── Energy and moves ────────────────────────────────────────────────────────

/** Can these Energy pay this cost? Colored dots need their own type; Colorless dots take any that's left. */
export function pays(energy: readonly EnergyType[], cost: readonly EnergyType[]): boolean {
  if (cost.length > energy.length) return false;
  let colorless = 0;
  let used = 0;
  // Small arrays: count each colored need against what's attached.
  for (let i = 0; i < cost.length; i++) {
    const t = cost[i];
    if (t === "Colorless") { colorless++; continue; }
    let need = 0;
    for (let j = 0; j < cost.length; j++) if (cost[j] === t) need++;
    // Count each type once (at its first position in the cost).
    if (cost.indexOf(t) !== i) continue;
    let have = 0;
    for (let j = 0; j < energy.length; j++) if (energy[j] === t) have++;
    if (have < need) return false;
    used += need;
  }
  return energy.length - used >= colorless;
}

/** The damage a move does right now: weather, the trainer's boost, your critical hit or confusion, then Weakness (×2). */
export function damageOf(s: DuelState, att: DuelCard, def: DuelCard, m: DuelMove, mine: boolean): number {
  let d = m.d;
  if (d > 0) {
    const w = s.fx.weather;
    if (w === "rain") { if (att.t === "Water") d += 30; else if (att.t === "Fire") d -= 30; }
    else if (w === "sun") { if (att.t === "Fire") d += 30; else if (att.t === "Water") d -= 30; }
    if (!mine) d += s.fx.boost;
    d = Math.max(0, d);
    if (mine && s.fx.crit) d = r10(d * 1.5);
    if (mine && s.fx.confused) d = r10(d / 2);
  }
  if (def.weak && def.weak === att.t) d *= 2;
  return d;
}

/** Hitting this card's Weakness. */
export const isWeak = (att: DuelCard, def: DuelCard) => !!def.weak && def.weak === att.t;

/** The move with the most printed damage (the obvious play's "hardest hitter"). */
export const topDamage = (c: DuelCard) => c.moves.reduce((n, m) => Math.max(n, m.d), 0);

/**
 * The Energy the trainer's card gets on its turn: the first colored type its best move (most
 * printed damage) still lacks; once every move is covered, or only Colorless is missing, its own type.
 */
export function foeEnergy(card: DuelCard, energy: readonly EnergyType[]): EnergyType {
  let best: DuelMove | null = null;
  for (const m of card.moves) if (!pays(energy, m.cost) && (!best || m.d > best.d)) best = m;
  if (best) {
    for (const t of best.cost) {
      if (t === "Colorless") continue;
      let need = 0;
      let have = 0;
      for (const x of best.cost) if (x === t) need++;
      for (const x of energy) if (x === t) have++;
      if (have < need) return t;
    }
  }
  return card.t;
}

/** The move the trainer's card on the field would use now (strongest usable by damage), or -1. Ties go to the earlier move. */
export function foeChoice(setup: DuelSetup, s: DuelState, energy: readonly EnergyType[] = s.foe[s.fi].energy): number {
  const card = setup.foe[s.fi];
  const def = s.yi >= 0 ? setup.you[s.yi] : null;
  let best = -1;
  let bestD = -1;
  for (let i = 0; i < card.moves.length; i++) {
    const m = card.moves[i];
    if (!pays(energy, m.cost)) continue;
    const d = def ? damageOf(s, card, def, m, false) : m.d;
    if (d > bestD) { best = i; bestD = d; }
  }
  return best;
}

// ─── the events ──────────────────────────────────────────────────────────────

/** The event that flips at the start of a turn, if any. */
export function eventAt(setup: DuelSetup, turn: number): DuelEventKind | null {
  for (const e of setup.events) if (e.turn === turn) return e.kind;
  return null;
}

/** The waiting card Team Rocket grabs: the one with the most Energy, then the most HP, then the first. -1 when none is waiting. */
export function rocketTarget(s: DuelState): number {
  let best = -1;
  for (let i = 0; i < s.you.length; i++) {
    const c = s.you[i];
    if (i === s.yi || c.out) continue;
    if (best < 0) { best = i; continue; }
    const b = s.you[best];
    if (c.energy.length > b.energy.length || (c.energy.length === b.energy.length && c.cur > b.cur)) best = i;
  }
  return best;
}

/** The card a Revive brings back: your knocked-out card with the most printed HP, then the first. -1 when none is out. */
export function reviveTarget(setup: DuelSetup, s: DuelState): number {
  let best = -1;
  for (let i = 0; i < s.you.length; i++) {
    if (!s.you[i].out) continue;
    if (best < 0 || setup.you[i].hp > setup.you[best].hp) best = i;
  }
  return best;
}

type Log = DuelLogLine[] | null;
const note = (L: Log, line: DuelLogLine) => { if (L) L.push(line); };

function giveFoeEnergy(setup: DuelSetup, s: DuelState, L: Log) {
  const f = s.foe[s.fi];
  const t = foeEnergy(setup.foe[s.fi], f.energy);
  f.energy.push(t);
  note(L, { kind: "energy", side: "foe", card: s.fi, type: t, text: `${setup.trainer}'s ${setup.foe[s.fi].short} gets ${t} Energy.` });
}

function heal(setup: DuelSetup, slot: DuelSlot, card: DuelCard, n: number): number {
  const before = slot.cur;
  slot.cur = Math.min(card.hp, slot.cur + n);
  return slot.cur - before;
}

function applyEvent(setup: DuelSetup, s: DuelState, ev: DuelEventKind, L: Log) {
  const you = s.you[s.yi];
  const youCard = setup.you[s.yi];
  const foe = s.foe[s.fi];
  const foeCard = setup.foe[s.fi];
  switch (ev) {
    case "rain":
    case "sun":
    case "sand":
      // A new weather replaces the old one.
      s.fx.weather = ev;
      s.fx.weatherLeft = WEATHER_TURNS;
      break;
    case "rocket": {
      const w = rocketTarget(s);
      if (w >= 0) {
        s.fx.rocket = w;
        s.fx.rocketLeft = ROCKET_TURNS;
        note(L, { kind: "event", side: "you", card: w, text: `Team Rocket grabs your ${setup.you[w].short} for ${ROCKET_TURNS} turns.` });
      } else note(L, { kind: "event", side: null, text: "Team Rocket finds nothing to grab." });
      break;
    }
    case "joy": {
      const n = heal(setup, you, youCard, 50);
      note(L, { kind: "heal", side: "you", card: s.yi, amount: n, text: `Your ${youCard.short} heals ${n}.` });
      break;
    }
    case "potion": {
      const n = heal(setup, you, youCard, 30);
      note(L, { kind: "heal", side: "you", card: s.yi, amount: n, text: `Your ${youCard.short} heals ${n}.` });
      break;
    }
    case "wild": {
      const a = you.cur;
      const b = foe.cur;
      you.cur = chip(you.cur, 20);
      foe.cur = chip(foe.cur, 20);
      note(L, { kind: "event", side: null, text: `A wild Pokémon hits your ${youCard.short} for ${a - you.cur} and ${setup.trainer}'s ${foeCard.short} for ${b - foe.cur}.` });
      break;
    }
    case "sleep":
      s.fx.sleep = s.fi;
      break;
    case "confused":
      s.fx.confused = true;
      break;
    case "crit":
      s.fx.crit = true;
      break;
    case "advice":
      s.fx.advice = true;
      break;
    case "ace":
      // Whichever card on the field has more HP right now loafs around; a tie goes to the trainer's.
      if (you.cur > foe.cur) s.fx.aceYou = true;
      else s.fx.aceFoe = s.fi;
      break;
    case "revive": {
      const r = reviveTarget(setup, s);
      if (r >= 0) {
        const c = s.you[r];
        c.out = false;
        c.energy = [];
        c.cur = Math.max(10, Math.floor(setup.you[r].hp / 20) * 10);
        note(L, { kind: "revive", side: "you", card: r, text: `Your ${setup.you[r].short} comes back with ${c.cur} HP.` });
      } else note(L, { kind: "event", side: null, text: "Nothing to revive yet." });
      break;
    }
    case "signature":
      if (setup.signature === "energy2") { giveFoeEnergy(setup, s, L); giveFoeEnergy(setup, s, L); }
      else if (setup.signature === "heal50") {
        const n = heal(setup, foe, foeCard, 50);
        note(L, { kind: "heal", side: "foe", card: s.fi, amount: n, text: `${setup.trainer}'s ${foeCard.short} heals ${n}.` });
      } else s.fx.boost += 30;
      break;
  }
}

// ─── a turn ──────────────────────────────────────────────────────────────────

/** The start of your turn: this turn's Energy, Team Rocket's countdown, then the turn's event. */
function beginTurn(setup: DuelSetup, s: DuelState, L: Log) {
  s.turn += 1;
  s.pending = setup.row.length ? setup.row[(s.turn - 1) % setup.row.length] : null;
  s.fx.aceYou = false;
  s.fx.advice = false;
  if (s.fx.rocketLeft > 0) {
    s.fx.rocketLeft -= 1;
    if (s.fx.rocketLeft === 0) s.fx.rocket = -1;
  }
  s.event = eventAt(setup, s.turn);
  if (s.event) {
    const from = L ? L.length : 0;
    applyEvent(setup, s, s.event, L);
    if (L) for (let i = from; i < L.length; i++) L[i].ev = s.event;
  }
}

function hit(setup: DuelSetup, s: DuelState, mine: boolean, mi: number, L: Log): boolean {
  const att = mine ? setup.you[s.yi] : setup.foe[s.fi];
  const def = mine ? setup.foe[s.fi] : setup.you[s.yi];
  const target = mine ? s.foe[s.fi] : s.you[s.yi];
  const m = att.moves[mi];
  const d = damageOf(s, att, def, m, mine);
  if (mine) { s.fx.crit = false; s.fx.confused = false; } else s.fx.boost = 0;
  target.cur = Math.max(0, target.cur - d);
  const weak = d > 0 && isWeak(att, def);
  note(L, { kind: "move", side: mine ? "you" : "foe", card: mine ? s.yi : s.fi, damage: d, weak, move: m.n, text: `${mine ? "Your" : `${setup.trainer}'s`} ${att.short} used ${m.n}: ${d}${weak ? ", super effective" : ""}.` });
  if (target.cur > 0) return false;
  target.out = true;
  target.energy = [];
  note(L, { kind: "ko", side: mine ? "foe" : "you", card: mine ? s.fi : s.yi, text: `${mine ? `${setup.trainer}'s` : "Your"} ${def.short} is knocked out.` });
  return true;
}

/** The trainer's turn: one Energy for its card on the field, then its strongest move (unless it's asleep or loafing). */
function foeTurn(setup: DuelSetup, s: DuelState, L: Log) {
  giveFoeEnergy(setup, s, L);
  const card = setup.foe[s.fi];
  if (s.fx.sleep === s.fi) {
    s.fx.sleep = -1;
    note(L, { kind: "skip", side: "foe", card: s.fi, why: "asleep", text: `${setup.trainer}'s ${card.short} is asleep.` });
  } else if (s.fx.aceFoe === s.fi) {
    s.fx.aceFoe = -1;
    note(L, { kind: "skip", side: "foe", card: s.fi, why: "stubborn", text: `${setup.trainer}'s ${card.short} loafs around.` });
  } else {
    const mi = foeChoice(setup, s);
    if (mi < 0) note(L, { kind: "wait", side: "foe", card: s.fi, text: `${setup.trainer}'s ${card.short} waits.` });
    else if (hit(setup, s, false, mi, L) && !alive(s.you)) s.over = "lost";
  }
}

/** End of the turn: sand hits the cards on the field (never a knockout), then the weather counts down. */
function endTurn(setup: DuelSetup, s: DuelState, L: Log) {
  if (s.fx.weather === "sand") {
    const stings = (c: DuelCard) => c.t !== "Fighting" && c.t !== "Metal";
    if (s.yi >= 0 && !s.you[s.yi].out && stings(setup.you[s.yi])) {
      const before = s.you[s.yi].cur;
      s.you[s.yi].cur = chip(before, 10);
      if (before !== s.you[s.yi].cur) note(L, { kind: "sand", side: "you", card: s.yi, damage: before - s.you[s.yi].cur, text: `The sandstorm hits your ${setup.you[s.yi].short}.` });
    }
    const f = s.foe[s.fi];
    if (!f.out && stings(setup.foe[s.fi])) {
      const before = f.cur;
      f.cur = chip(before, 10);
      if (before !== f.cur) note(L, { kind: "sand", side: "foe", card: s.fi, damage: before - f.cur, text: `The sandstorm hits ${setup.trainer}'s ${setup.foe[s.fi].short}.` });
    }
  }
  if (s.fx.weatherLeft > 0) {
    s.fx.weatherLeft -= 1;
    if (s.fx.weatherLeft === 0) s.fx.weather = null;
  }
  if (!s.over && s.turn >= TURN_CAP) s.over = "lost";
}

export const alive = (arr: readonly DuelSlot[]) => {
  let n = 0;
  for (const c of arr) if (!c.out) n++;
  return n;
};

/** Your card on the field is gone (or the duel hasn't started): pick the next one before the turn begins. */
export const needsNext = (s: DuelState) => !s.over && (s.yi < 0 || s.you[s.yi].out);

/** The cards you can send out: any standing card, but not the one Team Rocket has unless it's the only one left. */
export function nexts(s: DuelState): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.you.length; i++) if (!s.you[i].out && i !== s.fx.rocket) out.push(i);
  if (!out.length && s.fx.rocket >= 0 && !s.you[s.fx.rocket].out) out.push(s.fx.rocket);
  return out;
}

/** The cards this turn's Energy can go on: every standing card. */
export function attachTargets(s: DuelState): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.you.length; i++) if (!s.you[i].out) out.push(i);
  return out;
}

/** The waiting cards you can swap in (not Team Rocket's). */
export function swapTargets(s: DuelState): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.you.length; i++) if (i !== s.yi && !s.you[i].out && i !== s.fx.rocket) out.push(i);
  return out;
}

/** At the start of your turn, ready for an action. */
export const atTurn = (s: DuelState) => !s.over && s.turn > 0 && s.yi >= 0 && !s.you[s.yi].out && s.pending !== null;

/** Can your card on the field use move `mi` this turn, with the Energy going on `attach`? */
export function canUse(setup: DuelSetup, s: DuelState, attach: number, mi: number): boolean {
  if (s.fx.aceYou) return false;
  const card = setup.you[s.yi];
  const m = card.moves[mi];
  if (!m) return false;
  const e = s.you[s.yi].energy;
  return pays(attach === s.yi && s.pending ? [...e, s.pending] : e, m.cost);
}

/** Is this a legal action right now? */
export function isLegal(setup: DuelSetup, s: DuelState, a: DuelAction): boolean {
  if (!atTurn(s)) return false;
  if (!Number.isInteger(a.attach) || a.attach < 0 || a.attach >= s.you.length || s.you[a.attach].out) return false;
  const act = a.act as { move?: number; swap?: number; wait?: boolean };
  if (act.move != null) return Number.isInteger(act.move) && canUse(setup, s, a.attach, act.move);
  if (act.swap != null) return swapTargets(s).includes(act.swap);
  return act.wait === true;
}

/** Every legal action this turn (the solver's choices). */
export function actions(setup: DuelSetup, s: DuelState): DuelAction[] {
  const out: DuelAction[] = [];
  if (!atTurn(s)) return out;
  const swaps = swapTargets(s);
  const card = setup.you[s.yi];
  for (const at of attachTargets(s)) {
    for (let mi = 0; mi < card.moves.length; mi++) if (canUse(setup, s, at, mi)) out.push({ attach: at, act: { move: mi } });
    for (const w of swaps) out.push({ attach: at, act: { swap: w } });
    out.push({ attach: at, act: { wait: true } });
  }
  return out;
}

/**
 * Your action, then the trainer's reply and the end of the turn. Returns a new state, stopped
 * before your next turn (call `begin`, with a card first when `needsNext`). The action must be
 * legal (isLegal); `quiet` skips the log lines (the solver).
 */
export function step(setup: DuelSetup, s0: DuelState, a: DuelAction, quiet = false): DuelState {
  const s = cloneState(s0);
  const L: Log = quiet ? null : s.log;
  if (s.pending) {
    s.you[a.attach].energy.push(s.pending);
    note(L, { kind: "energy", side: "you", card: a.attach, type: s.pending, text: `${s.pending} Energy goes on your ${setup.you[a.attach].short}.` });
  }
  s.pending = null;
  s.event = null;
  const act = a.act as { move?: number; swap?: number };
  if (act.move != null) {
    const ko = hit(setup, s, true, act.move, L);
    if (ko) {
      if (s.fx.sleep === s.fi) s.fx.sleep = -1;
      if (s.fx.aceFoe === s.fi) s.fx.aceFoe = -1;
      if (!alive(s.foe)) { s.over = "won"; return s; }
      s.fi = s.foe.findIndex((c) => !c.out);
      note(L, { kind: "out", side: "foe", card: s.fi, text: `${setup.trainer} sends out ${setup.foe[s.fi].short}.` });
    }
  } else if (act.swap != null) {
    s.yi = act.swap;
    note(L, { kind: "swap", side: "you", card: s.yi, text: `You swap in ${setup.you[s.yi].short}.` });
  } else note(L, { kind: "wait", side: "you", card: s.yi, text: "You wait." });
  foeTurn(setup, s, L);
  endTurn(setup, s, L);
  return s;
}

/** Begins your next turn (sending out `next` first when one is needed). */
export function begin(setup: DuelSetup, s0: DuelState, next: number | null, quiet = false): DuelState {
  const s = cloneState(s0);
  if (next != null) {
    s.yi = next;
    if (!quiet) s.log.push({ kind: "out", side: "you", card: next, text: `You send out ${setup.you[next].short}.` });
  }
  beginTurn(setup, s, quiet ? null : s.log);
  return s;
}

/**
 * One step as the server takes it: a card to send out ({ next }) when one is needed, else a turn.
 * After a turn the next one begins straight away unless a card is needed or the duel is over, so a
 * stored state always waits on the player. Null when the step isn't allowed now.
 */
export function applyStep(setup: DuelSetup, s: DuelState, st: DuelStep): DuelState | null {
  if (s.over) return null;
  if ("next" in st) {
    if (!needsNext(s) || !nexts(s).includes(st.next)) return null;
    return begin(setup, s, st.next);
  }
  if (needsNext(s) || !isLegal(setup, s, st)) return null;
  const t = step(setup, s, st);
  if (t.over || needsNext(t)) return t;
  const u = begin(setup, t, null);
  // One log for the whole exchange: your turn, the trainer's, then the new turn's event.
  u.log = [...t.log, ...u.log];
  return u;
}

/** Replays a line of steps from the start. Null if any step isn't allowed. */
export function replay(setup: DuelSetup, line: readonly DuelStep[]): DuelState | null {
  let s: DuelState | null = startState(setup);
  for (const st of line) {
    s = applyStep(setup, s, st);
    if (!s) return null;
  }
  return s;
}

/** Your cards still standing. */
export const cardsLeft = (s: DuelState) => alive(s.you);

// ─── what the player sees ────────────────────────────────────────────────────

/**
 * The duel as the player may see it: the table, this turn's Energy and the next 3, this turn's
 * event and the next one (the forecast), and nothing further. Never send the setup itself to a page.
 */
export function viewOf(setup: DuelSetup, s: DuelState, trainer: Pick<DuelTrainer, "name" | "signature">): DuelPlayView {
  const turnNow = atTurn(s);
  const ev = (kind: DuelEventKind | null, turn: number): DuelEventView | null => (kind ? { kind, turn, ...eventCopy(kind, trainer) } : null);
  const yourCard = s.yi >= 0 && !s.you[s.yi].out ? setup.you[s.yi] : null;
  const foeCard = s.foe[s.fi] && !s.foe[s.fi].out ? setup.foe[s.fi] : null;
  const side = (mine: boolean): DuelCardView[] => (mine ? setup.you : setup.foe).map((c, i) => {
    const slot = (mine ? s.you : s.foe)[i];
    const across = mine ? foeCard : yourCard;
    const field = mine ? i === s.yi : i === s.fi;
    return {
      index: i, id: c.id, name: c.name, short: c.short, t: c.t, hp: c.hp, weak: c.weak, ex: c.ex, img: c.img,
      moves: c.moves.map((m) => ({
        n: m.n, cost: m.cost.slice(), d: m.d,
        damage: across ? damageOf(s, c, across, m, mine) : null,
        weak: !!across && m.d > 0 && isWeak(c, across),
        ready: pays(slot.energy, m.cost),
        readyWithNew: mine && turnNow && !slot.out && !!s.pending && pays([...slot.energy, s.pending], m.cost),
      })),
      cur: slot.cur, energy: slot.energy.slice(), out: slot.out, field: field && !slot.out,
      grabbed: mine && s.fx.rocket === i ? s.fx.rocketLeft : 0,
      skips: mine ? field && s.fx.aceYou : s.fx.sleep === i || s.fx.aceFoe === i,
    };
  });
  // During turn N you place row[N - 1] and see row[N .. N + 2]; between turns the next to place is
  // row[N], so the same three show (nothing new comes into view until the turn begins).
  const next = s.over ? [] : setup.row.slice(s.turn, s.turn + 3);
  const advice = turnNow && s.fx.advice && foeCard ? (() => {
    const mi = foeChoice(setup, s, [...s.foe[s.fi].energy, foeEnergy(foeCard, s.foe[s.fi].energy)]);
    return mi >= 0 ? { card: s.fi, move: mi, name: foeCard.moves[mi].n } : null;
  })() : null;
  return {
    turn: s.turn,
    turnCap: TURN_CAP,
    you: side(true),
    foe: side(false),
    yi: s.yi,
    fi: s.fi,
    needsNext: needsNext(s),
    nexts: needsNext(s) ? nexts(s) : [],
    energy: { now: turnNow ? s.pending : null, next },
    attachTo: turnNow ? attachTargets(s) : [],
    swaps: turnNow ? swapTargets(s) : [],
    canMove: turnNow && !s.fx.aceYou,
    event: turnNow ? ev(s.event, s.turn) : null,
    forecast: s.over ? null : ev(eventAt(setup, s.turn + 1), s.turn + 1),
    inPlay: {
      weather: s.fx.weather ? { kind: s.fx.weather, turnsLeft: s.fx.weatherLeft } : null,
      crit: s.fx.crit,
      confused: s.fx.confused,
      foeAsleep: s.fx.sleep === s.fi && s.fx.sleep >= 0,
      foeStubborn: s.fx.aceFoe === s.fi && s.fx.aceFoe >= 0,
      youStubborn: turnNow && s.fx.aceYou,
      boost: s.fx.boost,
      rocket: s.fx.rocket >= 0 ? { card: s.fx.rocket, turnsLeft: s.fx.rocketLeft } : null,
    },
    advice,
    log: s.log.map((l) => ({ ...l })),
    over: s.over,
    cardsLeft: cardsLeft(s),
    foeLeft: alive(s.foe),
  };
}
