/**
 * Trainer battles: two players duel each other turn by turn (picks 2026-11-11, all as recommended, with a coin flip
 * for who goes first: Britton, "let's not omit things like that unless it's game breaking"). Pure, deterministic,
 * client-safe. The Daily Duel's engine (engine.ts) is one-sided (the game plays the trainer); this is its two-sided
 * cousin, built from the same pieces: damage (`damageOf`, weather and Weakness included), costs (`pays`), conditions
 * (`CONDITION_RULES`, rolled with `roll` from the battle's seed) and Energy rows (`foeRowFor`, each player's built for
 * their own team the same way). Nothing in engine.ts changes, so Daily Duel and Trainer Road replays stay identical.
 *
 * Each player picked a Trainer Road team in the room's lobby and brought 3 of its cards (the store does that part);
 * the setup holds only the brought cards. Then:
 *   1. Leads: both pick a lead, hidden until both have (`{ lead }`).
 *   2. The coin (`setup.first`, from the seed) decides who goes first. The first player can't attack on turn 1.
 *   3. Turns alternate. A turn: the player's card on the field must be standing (a knocked-out one is replaced first,
 *      `{ next }`, and comes in with Normal's 1 comeback Energy); then one Energy from their hand of 3 goes on any of
 *      their cards (they draw the row's next), then a move, a swap or wait (the duel's `DuelAction`).
 *   4. End of a turn: the sandstorm and Burned/Poisoned hit the card of the player whose turn it was.
 *   5. A round is both players' turns. Weather (the only events) starts at the start of a round, shown a round ahead,
 *      and lasts WEATHER_TURNS rounds.
 * A player whose card is knocked out on their own turn (confusion, a burn) sends out the next before the other plays.
 * A turn that runs out of time plays itself (the Energy on the card on the field, then wait); three missed turns lose.
 * After ROUND_CAP rounds the player with more cards standing wins, then more HP, else it's a draw.
 */

import { CONDITION_RULES, WEATHER_TURNS, damageOf, foeEnergy, foeRowFor, fxChance, isWeak, pays, roll, viewOf } from "./engine";
import type { DuelLogKind, DuelLogLine, DuelSetup, DuelSlot, DuelState } from "./engine";
import type { DuelAction, DuelCard, DuelCondition, DuelEventAt, DuelMoveFx, DuelRules, EnergyType } from "./types";
import type { DuelPlayView } from "./view";

export type Side = 0 | 1;
export const other = (s: Side): Side => (s === 0 ? 1 : 0);

/** Cards each player brings. */
export const BRING = 3;
export const HAND = 3;
export const COMEBACK = 1;
/** Missed turns that lose the battle. */
export const MISSES_LOSE = 3;
export const ROUND_CAP = 30;
/** Rules the battle's cards play by (engine.ts conditions are on from rules 2). */
export const BATTLE_RULES: DuelRules = 7;

export interface BattleSetup {
  seed: string;
  /** Players' names, for the lines ("Riley's Leavanny"). */
  names: [string, string];
  /** Each player's brought cards, in the order they brought them. */
  teams: [DuelCard[], DuelCard[]];
  rows: [EnergyType[], EnergyType[]];
  /** Weather by round. */
  events: DuelEventAt[];
  /** Who goes first: the coin. */
  first: Side;
}

export interface BattleSide {
  slots: DuelSlot[];
  /** The card on the field, -1 before the lead. */
  active: number;
  hand: EnergyType[];
  drawn: number;
  missed: number;
  /** A card sent out this turn (for "came in this turn" attacks), and the comeback Energy it brought. */
  arrived?: number;
  fresh?: number;
}

export type BattleWhy = "knockout" | "timeout" | "left" | "cap";

/** A line of what happened. Its words are written for each viewer (`lineText`), so it keeps the facts only. */
export interface BattleLine {
  kind: DuelLogKind;
  side: Side | null;
  card?: number;
  damage?: number;
  weak?: boolean;
  move?: string;
  type?: EnergyType;
  why?: "asleep" | "paralyzed";
  cond?: DuelCondition;
  amount?: number;
  ev?: "rain" | "sun" | "sand";
  /** The turn the line belongs to. */
  turn: number;
}

export interface BattleState {
  /** Turns played so far plus the one in play (0 while the leads are picked). */
  turn: number;
  /** Whose turn it is. */
  side: Side;
  /** Rounds begun (a round is both players' turns). */
  round: number;
  sides: [BattleSide, BattleSide];
  weather: "rain" | "sun" | "sand" | null;
  weatherLeft: number;
  /** The weather that started this round, if any. */
  event: "rain" | "sun" | "sand" | null;
  /** The winner, a draw, or null while it's on. */
  over: Side | "draw" | null;
  why: BattleWhy | null;
  log: BattleLine[];
}

export type BattleStep = { lead: number } | { next: number } | DuelAction;

// ─── setup ───────────────────────────────────────────────────────────────────

/** The coin: the same answer for everyone who looks at this battle. */
export const coinFor = (seed: string): Side => (roll(seedOnly(seed), "coin") < 50 ? 0 : 1);

/** Weather through the battle: the first at round 3, then every 3 or 4 rounds (seeded). */
export function weatherFor(seed: string): DuelEventAt[] {
  const kinds = ["rain", "sun", "sand"] as const;
  const out: DuelEventAt[] = [];
  let r = 3;
  while (r <= ROUND_CAP) {
    out.push({ turn: r, kind: kinds[Math.min(2, Math.floor(roll(seedOnly(seed), `w:${r}`) / 100 * 3))] });
    r += roll(seedOnly(seed), `g:${r}`) < 50 ? 3 : 4;
  }
  return out;
}

export function makeBattle(seed: string, names: [string, string], teams: [DuelCard[], DuelCard[]]): BattleSetup {
  return {
    seed, names, teams,
    rows: [foeRowFor(teams[0], `${seed}:row0`), foeRowFor(teams[1], `${seed}:row1`)],
    events: weatherFor(seed),
    first: coinFor(seed),
  };
}

export function startBattle(setup: BattleSetup): BattleState {
  const side = (i: Side): BattleSide => ({
    slots: setup.teams[i].map((c) => ({ cur: c.hp, energy: [], out: false })),
    active: -1,
    hand: setup.rows[i].slice(0, HAND),
    drawn: HAND,
    missed: 0,
  });
  return { turn: 0, side: setup.first, round: 0, sides: [side(0), side(1)], weather: null, weatherLeft: 0, event: null, over: null, why: null, log: [] };
}

// ─── reading the state ───────────────────────────────────────────────────────

const seedOnly = (seed: string) => ({ seed }) as DuelSetup;
const copySlot = (c: DuelSlot): DuelSlot => {
  const out: DuelSlot = { cur: c.cur, energy: c.energy.slice(), out: c.out };
  if (c.cond) out.cond = { k: c.cond.k, n: c.cond.n };
  if (c.conf) out.conf = c.conf;
  return out;
};
export function cloneBattle(s: BattleState): BattleState {
  const side = (b: BattleSide): BattleSide => {
    const out: BattleSide = { slots: b.slots.map(copySlot), active: b.active, hand: b.hand.slice(), drawn: b.drawn, missed: b.missed };
    if (b.arrived != null) out.arrived = b.arrived;
    if (b.fresh) out.fresh = b.fresh;
    return out;
  };
  return { ...s, sides: [side(s.sides[0]), side(s.sides[1])], log: s.log.slice() };
}

export const standing = (b: BattleSide) => b.slots.filter((c) => !c.out).length;
const hasActive = (b: BattleSide) => b.active >= 0 && !b.slots[b.active].out;

/** Both leads picked: the battle is under way. */
export const leadsDone = (s: BattleState) => s.turn > 0;

/** The side that must send a card out right now (a knocked-out card on the field and cards left), or null. */
export function sendOut(s: BattleState): Side | null {
  if (s.over != null || !leadsDone(s)) return null;
  // The player whose turn it isn't goes first, so the one whose turn it is has something to hit.
  for (const x of [other(s.side), s.side] as Side[]) {
    const b = s.sides[x];
    if (!hasActive(b) && standing(b) > 0) return x;
  }
  return null;
}

/** Whose move the battle waits for: both while leads are picked, else the one sending out, else whose turn it is. */
export function waitingOn(s: BattleState): Side[] {
  if (s.over != null) return [];
  if (!leadsDone(s)) return ([0, 1] as Side[]).filter((x) => s.sides[x].active < 0);
  const so = sendOut(s);
  return so != null ? [so] : [s.side];
}

/** The duel engine's picture of the battle from one side ("you" = that side). Shares the slots: read it, or copy. */
function mirror(setup: BattleSetup, s: BattleState, me: Side): { dsetup: DuelSetup; ds: DuelState } {
  const op = other(me);
  const mine = s.sides[me];
  const theirs = s.sides[op];
  const dsetup: DuelSetup = {
    you: setup.teams[me], foe: setup.teams[op], row: setup.rows[me], events: setup.events, signature: "energy2",
    trainer: setup.names[op], rules: BATTLE_RULES, seed: setup.seed, hand: HAND, comeback: COMEBACK,
  };
  const myTurn = leadsDone(s) && s.over == null && s.side === me && sendOut(s) == null;
  const ds: DuelState = {
    turn: Math.max(0, s.round),
    you: mine.slots,
    foe: theirs.slots,
    yi: mine.active,
    // The other lead stays hidden until both are picked.
    fi: leadsDone(s) ? Math.max(0, theirs.active) : -1,
    pending: myTurn ? mine.hand[0] ?? null : null,
    fx: {
      weather: s.weather, weatherLeft: s.weatherLeft, crit: false, confused: false, sleep: -1, aceFoe: -1, aceYou: false,
      boost: 0, rocket: -1, rocketLeft: 0, advice: false,
      ...(mine.arrived != null && s.side === me ? { arrived: mine.arrived } : {}),
      ...(mine.fresh && s.side === me ? { fresh: mine.fresh } : {}),
    },
    event: s.side === me ? s.event : null,
    over: s.over == null || s.over === "draw" ? null : s.over === me ? "won" : "lost",
    log: [],
    hand: mine.hand,
    drawn: mine.drawn,
  };
  return { dsetup, ds };
}

// ─── the lines ───────────────────────────────────────────────────────────────

const WEATHER_WORD = { rain: "It starts to rain.", sun: "The sun comes out.", sand: "A sandstorm blows in." } as const;
const COND_WORD: Record<DuelCondition, string> = { burned: "Burned", poisoned: "Poisoned", paralyzed: "Paralyzed", asleep: "Asleep", confused: "Confused" };

/** A line in words for one viewer: "Your Manectric" for their own cards, "Riley's Leavanny" for the other side's. Spectators (null) see both names. */
export function lineText(setup: BattleSetup, l: BattleLine, viewer: Side | null): string {
  if (l.side == null) return l.ev ? WEATHER_WORD[l.ev] : "";
  const mine = viewer === l.side;
  const owner = mine ? "Your" : `${setup.names[l.side]}'s`;
  const card = l.card != null ? setup.teams[l.side][l.card] : null;
  const c = card ? `${owner} ${card.short}` : owner;
  const lc = card ? `${mine ? "your" : `${setup.names[l.side]}'s`} ${card.short}` : "";
  const who = mine ? "You" : setup.names[l.side];
  switch (l.kind) {
    case "move": return `${c} used ${l.move}: ${l.damage ?? 0}${l.weak ? ", super effective" : ""}.`;
    case "ko": return `${c} is knocked out.`;
    case "out": return `${who} ${mine ? "send" : "sends"} out ${card?.short ?? "a card"}.`;
    case "swap": return `${who} ${mine ? "swap" : "swaps"} in ${card?.short ?? "a card"}.`;
    case "wait": return `${who} ${mine ? "wait" : "waits"}.`;
    case "skip": return l.why === "paralyzed" ? `${c} is paralyzed and can't move.` : `${c} is asleep.`;
    case "sand": return `The sandstorm hits ${lc}.`;
    case "energy": return l.type ? `${l.type} Energy goes on ${lc}.` : `${c} comes in with an Energy for coming back.`;
    case "cond": return `${c} is now ${COND_WORD[l.cond ?? "burned"]}.`;
    case "tick": return `${c} takes ${l.damage ?? 0} from ${l.cond === "burned" ? "its burn" : "poison"}.`;
    case "wake": return `${c} wakes up.`;
    case "self": return `${c} is confused and hits itself for ${l.damage ?? 0}.`;
    default: return "";
  }
}

/** The line in the duel engine's shape for one viewer (the arena reads these). */
function duelLine(setup: BattleSetup, l: BattleLine, viewer: Side, spectator = false): DuelLogLine {
  const out: DuelLogLine = { kind: l.kind, side: l.side == null ? null : l.side === viewer ? "you" : "foe", text: lineText(setup, l, spectator ? null : viewer) };
  if (l.card != null) out.card = l.card;
  if (l.damage != null) out.damage = l.damage;
  if (l.weak) out.weak = true;
  if (l.move) out.move = l.move;
  if (l.type) out.type = l.type;
  if (l.why) out.why = l.why;
  if (l.cond) out.cond = l.cond;
  if (l.amount != null) out.amount = l.amount;
  if (l.ev) out.ev = l.ev;
  return out;
}

// ─── the rules ───────────────────────────────────────────────────────────────

type Lines = BattleLine[];
const put = (s: BattleState, L: Lines, line: Omit<BattleLine, "turn">) => L.push({ ...line, turn: s.turn });

/** The cards a player can send out (or lead with). */
export const sendable = (b: BattleSide) => b.slots.map((c, i) => (c.out ? -1 : i)).filter((i) => i >= 0);
/** Cards that can take this turn's Energy. */
const attachable = (b: BattleSide) => sendable(b);
/** Waiting cards that can be swapped in. */
const swappable = (b: BattleSide) => sendable(b).filter((i) => i !== b.active);

/** Can this side's card on the field use move `mi`, with the Energy `use` going on `attach`? */
export function canUseMove(setup: BattleSetup, s: BattleState, me: Side, attach: number, mi: number, use: number): boolean {
  const b = s.sides[me];
  if (s.turn === 1) return false;
  const slot = b.slots[b.active];
  if (!slot || slot.out || slot.cond?.k === "asleep") return false;
  const m = setup.teams[me][b.active].moves[mi];
  if (!m) return false;
  const e = b.hand[use];
  return pays(attach === b.active && e ? [...slot.energy, e] : slot.energy, m.cost);
}

/** Is this step this side's to make, and allowed, right now? */
export function isLegalStep(setup: BattleSetup, s: BattleState, me: Side, st: BattleStep): boolean {
  if (s.over != null) return false;
  const b = s.sides[me];
  if ("lead" in st) return !leadsDone(s) && b.active < 0 && Number.isInteger(st.lead) && sendable(b).includes(st.lead);
  if (!leadsDone(s)) return false;
  if ("next" in st) return sendOut(s) === me && Number.isInteger(st.next) && sendable(b).includes(st.next);
  if (sendOut(s) != null || s.side !== me) return false;
  const use = st.use ?? 0;
  if (!Number.isInteger(use) || use < 0 || use >= b.hand.length) return false;
  if (!Number.isInteger(st.attach) || !attachable(b).includes(st.attach)) return false;
  const act = st.act as { move?: number; swap?: number; wait?: boolean };
  if (act.move != null) return Number.isInteger(act.move) && canUseMove(setup, s, me, st.attach, act.move, use);
  if (act.swap != null) return swappable(b).includes(act.swap);
  return act.wait === true;
}

/** Puts a condition from a move on the card it hit, each on its own chance (the duel's rule). */
function inflict(setup: BattleSetup, s: BattleState, me: Side, mi: number, fx: readonly DuelMoveFx[], L: Lines) {
  const op = other(me);
  const ti = s.sides[op].active;
  const target = s.sides[op].slots[ti];
  if (!target || target.out) return;
  const key = `c:${s.turn}:${me}:${s.sides[me].active}:${mi}`;
  for (const f of fx) {
    if (roll(seedOnly(setup.seed), `${key}:${f.c}`) >= fxChance(f)) continue;
    if (f.c === "confused") {
      if (target.conf) continue;
      target.conf = CONDITION_RULES.confusedTurns;
    } else {
      if (target.cond?.k === f.c) continue;
      const span = CONDITION_RULES.sleepMax - CONDITION_RULES.sleepMin + 1;
      target.cond = { k: f.c, n: f.c === "asleep" ? CONDITION_RULES.sleepMin + Math.floor((roll(seedOnly(setup.seed), `${key}:z`) / 100) * span) : 0 };
    }
    put(s, L, { kind: "cond", side: op, card: ti, cond: f.c });
  }
}

function knockOut(s: BattleState, side: Side, i: number, L: Lines) {
  const slot = s.sides[side].slots[i];
  slot.out = true;
  slot.energy = [];
  delete slot.cond;
  delete slot.conf;
  put(s, L, { kind: "ko", side, card: i });
}

/** Someone has no cards left: the other side wins. */
function checkOver(s: BattleState) {
  if (s.over != null) return;
  const a = standing(s.sides[0]);
  const b = standing(s.sides[1]);
  if (a === 0 && b === 0) { s.over = "draw"; s.why = "knockout"; }
  else if (a === 0) { s.over = 1; s.why = "knockout"; }
  else if (b === 0) { s.over = 0; s.why = "knockout"; }
}

/** A move from `me`'s card on the field: Paralyzed may stop it, Confused may turn it on itself, else it lands. */
function attack(setup: BattleSetup, s: BattleState, me: Side, mi: number, L: Lines) {
  const op = other(me);
  const mb = s.sides[me];
  const ob = s.sides[op];
  const slot = mb.slots[mb.active];
  const key = `${s.turn}:${me}:${mb.active}`;
  if (slot.cond?.k === "paralyzed" && roll(seedOnly(setup.seed), `p:${key}`) < CONDITION_RULES.paralyzed) {
    put(s, L, { kind: "skip", side: me, card: mb.active, why: "paralyzed" });
    return;
  }
  if (slot.conf && roll(seedOnly(setup.seed), `x:${key}`) < CONDITION_RULES.confusedSelf) {
    const d = CONDITION_RULES.confusedHit;
    slot.cur = Math.max(0, slot.cur - d);
    put(s, L, { kind: "self", side: me, card: mb.active, damage: d, cond: "confused" });
    if (slot.cur === 0) knockOut(s, me, mb.active, L);
    return;
  }
  if (!hasActive(ob)) return;
  const { ds } = mirror(setup, s, me);
  const att = setup.teams[me][mb.active];
  const def = setup.teams[op][ob.active];
  const m = att.moves[mi];
  const d = damageOf(ds, att, def, m, true);
  const target = ob.slots[ob.active];
  target.cur = Math.max(0, target.cur - d);
  const weak = d > 0 && isWeak(att, def);
  put(s, L, { kind: "move", side: me, card: mb.active, damage: d, weak, move: m.n });
  if (target.cur > 0) {
    if (m.fx?.length) inflict(setup, s, me, mi, m.fx, L);
    return;
  }
  knockOut(s, op, ob.active, L);
}

/** Sends a card out: the lead (no Energy), or the next after a knockout (Normal's comeback Energy). */
function sendIn(setup: BattleSetup, s: BattleState, me: Side, i: number, L: Lines, comeback: boolean) {
  const b = s.sides[me];
  b.active = i;
  put(s, L, { kind: "out", side: me, card: i });
  if (!comeback) return;
  const slot = b.slots[i];
  for (let k = 0; k < COMEBACK; k++) slot.energy.push(foeEnergy(setup.teams[me][i], slot.energy));
  put(s, L, { kind: "energy", side: me, card: i });
  b.fresh = COMEBACK;
  b.arrived = i;
}

/** The end of `me`'s turn: the sandstorm, then Burned and Poisoned, on their card on the field. */
function endTurnFor(setup: BattleSetup, s: BattleState, me: Side, L: Lines) {
  const b = s.sides[me];
  if (!hasActive(b)) return;
  const slot = b.slots[b.active];
  const card = setup.teams[me][b.active];
  if (s.weather === "sand" && card.t !== "Fighting" && card.t !== "Metal") {
    const before = slot.cur;
    slot.cur = before <= 10 ? before : Math.max(10, before - 10);
    if (before !== slot.cur) put(s, L, { kind: "sand", side: me, card: b.active, damage: before - slot.cur });
  }
  if (!slot.cond) return;
  let d = 0;
  if (slot.cond.k === "burned") d = CONDITION_RULES.burn;
  else if (slot.cond.k === "poisoned") { slot.cond.n += 1; d = CONDITION_RULES.poison * slot.cond.n; }
  if (!d) return;
  const k = slot.cond.k;
  slot.cur = Math.max(0, slot.cur - d);
  put(s, L, { kind: "tick", side: me, card: b.active, damage: d, cond: k });
  if (slot.cur === 0) knockOut(s, me, b.active, L);
}

/** The next turn begins: the other player's, and a new round (with its weather) when it's back to the first player. */
function nextTurn(setup: BattleSetup, s: BattleState, L: Lines) {
  // The round ends after the second player's turn: the weather counts down.
  if (s.side !== setup.first && s.weatherLeft > 0) {
    s.weatherLeft -= 1;
    if (s.weatherLeft === 0) s.weather = null;
  }
  s.side = other(s.side);
  s.turn += 1;
  const b = s.sides[s.side];
  delete b.arrived;
  delete b.fresh;
  if (s.side === setup.first) beginRound(setup, s, L);
}

function beginRound(setup: BattleSetup, s: BattleState, L: Lines) {
  s.round += 1;
  s.event = null;
  if (s.round > ROUND_CAP) { finishAtCap(s); return; }
  const ev = setup.events.find((e) => e.turn === s.round)?.kind;
  if (ev === "rain" || ev === "sun" || ev === "sand") {
    s.weather = ev;
    s.weatherLeft = WEATHER_TURNS;
    s.event = ev;
    put(s, L, { kind: "event", side: null, ev });
  }
}

/** Round cap: more cards standing, then more HP left, else a draw. */
function finishAtCap(s: BattleState) {
  const hp = (b: BattleSide) => b.slots.reduce((n, c) => n + (c.out ? 0 : c.cur), 0);
  const a = standing(s.sides[0]) - standing(s.sides[1]);
  const h = hp(s.sides[0]) - hp(s.sides[1]);
  s.over = a > 0 ? 0 : a < 0 ? 1 : h > 0 ? 0 : h < 0 ? 1 : "draw";
  s.why = "cap";
}

/** Plays one step for side `me`. Returns the new state, or null when the step isn't allowed. */
export function applyBattle(setup: BattleSetup, s0: BattleState, me: Side, st: BattleStep): BattleState | null {
  if (!isLegalStep(setup, s0, me, st)) return null;
  const s = cloneBattle(s0);
  const L: Lines = [];
  const b = s.sides[me];
  if ("lead" in st) {
    b.active = st.lead;
    // Both leads in: they go out together, and the first player's first turn begins.
    if (s.sides[0].active >= 0 && s.sides[1].active >= 0) {
      s.turn = 1;
      s.side = setup.first;
      for (const x of [setup.first, other(setup.first)] as Side[]) put(s, L, { kind: "out", side: x, card: s.sides[x].active });
      beginRound(setup, s, L);
    }
    s.log = L;
    return s;
  }
  if ("next" in st) {
    sendIn(setup, s, me, st.next, L, true);
    s.log = [...s0.log.filter((l) => l.turn === s.turn), ...L];
    return s;
  }
  b.missed = 0;
  return turnFor(setup, s, s0, me, st, L);
}

function turnFor(setup: BattleSetup, s: BattleState, s0: BattleState, me: Side, st: DuelAction, L: Lines): BattleState {
  const b = s.sides[me];
  // Lines from this turn so far (a send-out) stay; the turn's lines replace the last turn's.
  const kept = s0.log.filter((l) => l.turn === s.turn);
  const use = st.use ?? 0;
  const t = b.hand[use];
  b.hand.splice(use, 1);
  if (setup.rows[me].length) b.hand.push(setup.rows[me][b.drawn % setup.rows[me].length]);
  b.drawn += 1;
  if (t) {
    b.slots[st.attach].energy.push(t);
    put(s, L, { kind: "energy", side: me, card: st.attach, type: t });
  }
  const act = st.act as { move?: number; swap?: number };
  const slot = b.slots[b.active];
  if (act.swap != null) {
    delete slot.cond;
    delete slot.conf;
    b.active = act.swap;
    put(s, L, { kind: "swap", side: me, card: b.active });
  } else {
    if (slot.cond?.k === "asleep") {
      put(s, L, { kind: "skip", side: me, card: b.active, why: "asleep" });
      slot.cond.n -= 1;
      if (slot.cond.n <= 0) { delete slot.cond; put(s, L, { kind: "wake", side: me, card: b.active, cond: "asleep" }); }
    } else if (act.move != null) attack(setup, s, me, act.move, L);
    else put(s, L, { kind: "wait", side: me, card: b.active });
    if (!slot.out && slot.conf) { slot.conf -= 1; if (slot.conf <= 0) delete slot.conf; }
  }
  checkOver(s);
  if (s.over == null) endTurnFor(setup, s, me, L);
  checkOver(s);
  if (s.over == null) nextTurn(setup, s, L);
  s.log = [...kept, ...L];
  return s;
}

/**
 * The clock ran out on whoever the battle waits for: a lead or a send-out picks their card with the most HP; a turn
 * plays itself (the hand's first Energy on the card on the field, then wait) and counts as missed. The third missed
 * turn loses the battle.
 */
export function timeOut(setup: BattleSetup, s0: BattleState): BattleState {
  if (s0.over != null) return s0;
  const most = (b: BattleSide) => sendable(b).reduce((best, i) => (best < 0 || b.slots[i].cur > b.slots[best].cur ? i : best), -1);
  if (!leadsDone(s0)) {
    let s = s0;
    for (const x of [0, 1] as Side[]) if (s.sides[x].active < 0) s = applyBattle(setup, s, x, { lead: most(s.sides[x]) }) ?? s;
    return s;
  }
  const so = sendOut(s0);
  if (so != null) return applyBattle(setup, s0, so, { next: most(s0.sides[so]) }) ?? s0;
  const me = s0.side;
  const missed = s0.sides[me].missed + 1;
  if (missed >= MISSES_LOSE) {
    const s = cloneBattle(s0);
    s.sides[me].missed = missed;
    s.over = other(me);
    s.why = "timeout";
    return s;
  }
  const s = applyBattle(setup, s0, me, { attach: s0.sides[me].active, act: { wait: true }, use: 0 }) ?? s0;
  if (s === s0) return s0;
  s.sides[me].missed = missed;
  return s;
}

/** A player left (or was gone too long): the other wins. */
export function forfeit(s0: BattleState, loser: Side): BattleState {
  if (s0.over != null) return s0;
  const s = cloneBattle(s0);
  s.over = other(loser);
  s.why = "left";
  return s;
}

/** Replays a battle from its steps (who made each): the store keeps the steps, so a battle can always be rebuilt. */
export function replayBattle(setup: BattleSetup, steps: readonly { by: Side | "clock" | "left"; st?: BattleStep; loser?: Side }[]): BattleState | null {
  let s = startBattle(setup);
  for (const x of steps) {
    if (x.by === "clock") s = timeOut(setup, s);
    else if (x.by === "left") s = forfeit(s, x.loser ?? 0);
    else {
      const n = x.st ? applyBattle(setup, s, x.by, x.st) : null;
      if (!n) return null;
      s = n;
    }
  }
  return s;
}

// ─── what a player sees ──────────────────────────────────────────────────────

/**
 * The battle from one side, in the Daily Duel arena's shape (`you` = this player): the other player's hand and row stay
 * hidden, their lead until both are picked. Spectators get side 0's picture without a hand (`spectator`).
 */
export function battleView(setup: BattleSetup, s: BattleState, me: Side, spectator = false): DuelPlayView {
  const { dsetup, ds } = mirror(setup, s, me);
  const copy: DuelState = { ...ds, you: ds.you.map(copySlot), foe: ds.foe.map(copySlot), log: s.log.map((l) => duelLine(setup, l, me, spectator)) };
  const v = viewOf(dsetup, copy, { name: setup.names[other(me)], signature: { title: "", effect: "energy2" } });
  // The first player can't attack on the first turn, and a spectator can't act at all.
  if (s.turn === 1 || spectator) {
    v.canMove = false;
    v.you = v.you.map((c) => ({ ...c, moves: c.moves.map((m) => ({ ...m, readyWithNew: false, ready: spectator ? m.ready : false })) }));
  }
  if (spectator) {
    v.attachTo = [];
    v.swaps = [];
    v.needsNext = false;
    v.nexts = [];
    v.energy = { now: null, next: [], hand: null };
  }
  v.turnCap = ROUND_CAP;
  v.needsBring = false;
  return v;
}
