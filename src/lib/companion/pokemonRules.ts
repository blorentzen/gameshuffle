/**
 * Pokémon TCG rules the companion knows (pure, client-safe). It reads the card
 * data our catalog already has (Scrydex fields cached in tcg_cards) and works
 * out what players at a real table do by hand: attack damage after Weakness
 * and Resistance, whether the Energy is there, how many prizes a Knock Out
 * gives, when a Pokémon may evolve, and the once-a-turn limits.
 *
 * It never blocks a move (Britton, 2026-10-11: remind, don't block). Card
 * effects bend the rules all the time, so `reminder*` returns a sentence to
 * show with "Play it anyway", or null. Rules in our own words; mechanics only.
 * Source: the Pokémon TCG rulebook (September 2026).
 */

import type { PlayerId } from "./types";

// ─── card data ────────────────────────────────────────────────────────────────

export interface AttackDamage {
  /** The printed number (0 when the attack only has text). */
  base: number;
  /** "+" or "×" or "-": the attack's text changes it; we show the base and say so. */
  mod: "+" | "×" | "-" | null;
  raw: string;
}

export interface CardAttack {
  name: string;
  /** Energy types, "Colorless" = any. */
  cost: string[];
  damage: AttackDamage | null;
  text: string | null;
}

/** What a placed card needs for the rules, kept on its board slot. */
export interface CardRules {
  types: string[];
  subtypes: string[];
  hp: number | null;
  attacks: CardAttack[];
  weaknesses: { type: string; value: string }[];
  resistances: { type: string; value: string }[];
  retreat: number;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter((x): x is string => !!x) : []);

export function parseDamage(raw: unknown): AttackDamage | null {
  const s = str(raw);
  if (!s) return null;
  const m = s.replace(/x/gi, "×").match(/^(\d+)\s*([+×-])?$/);
  if (!m) return null;
  return { base: Number(m[1]), mod: (m[2] as AttackDamage["mod"]) ?? null, raw: s };
}

/** Card data from the catalog (tolerant: the rules columns are untyped JSON). */
export function parseCardRules(card: { types?: unknown; subtypes?: unknown; hp?: unknown; attacks?: unknown; weaknesses?: unknown; resistances?: unknown; retreat_cost?: unknown }): CardRules {
  const attacks = (Array.isArray(card.attacks) ? card.attacks : []).map((a) => {
    const o = (a ?? {}) as Record<string, unknown>;
    return { name: str(o.name) ?? "Attack", cost: strList(o.cost), damage: parseDamage(o.damage), text: str(o.text) };
  });
  const pairs = (v: unknown) => (Array.isArray(v) ? v : []).map((w) => {
    const o = (w ?? {}) as Record<string, unknown>;
    return { type: str(o.type) ?? "", value: str(o.value) ?? "" };
  }).filter((w) => w.type);
  const hp = Number(str(card.hp) ?? NaN);
  return {
    types: strList(card.types),
    subtypes: strList(card.subtypes),
    hp: Number.isFinite(hp) ? hp : null,
    attacks,
    weaknesses: pairs(card.weaknesses),
    resistances: pairs(card.resistances),
    retreat: strList(card.retreat_cost).length,
  };
}

/** Rules data for a placed card, or null for a card with nothing to play by
 *  (a Trainer or Energy picked by mistake). */
export function rulesFromCard(card: Parameters<typeof parseCardRules>[0]): CardRules | null {
  const rules = parseCardRules(card);
  return rules.hp == null && rules.attacks.length === 0 ? null : rules;
}

// ─── prizes ───────────────────────────────────────────────────────────────────

/**
 * Prizes a Knock Out gives, from the card's subtypes. Today: Pokémon ex 2,
 * Mega Evolution Pokémon ex 3. Older eras still in collections: V, VSTAR, GX
 * and EX 2 (an XY Mega-EX too); VMAX, TAG TEAM and V-UNION 3.
 */
export function prizeValue(subtypes: string[]): number {
  const has = (t: string) => subtypes.includes(t);
  if (has("VMAX") || has("TAG TEAM") || has("V-UNION")) return 3;
  if (has("MEGA") && has("ex")) return 3;
  if (has("ex") || has("EX") || has("V") || has("VSTAR") || has("GX")) return 2;
  return 1;
}

// ─── Energy ───────────────────────────────────────────────────────────────────

/**
 * Whether the attached Energy pays a cost. Typed Energy must match; Colorless
 * takes anything left over. `attached` is the slot's map (lowercase keys like
 * "lightning"; anything that isn't a type, like "special", only pays Colorless).
 */
export function energyCheck(cost: string[], attached: Record<string, number>): { met: boolean; missing: number } {
  const pool = new Map<string, number>();
  for (const [k, n] of Object.entries(attached)) if (n > 0) pool.set(k.toLowerCase(), n);
  let missing = 0;
  for (const type of cost.filter((t) => t.toLowerCase() !== "colorless")) {
    const k = type.toLowerCase();
    const have = pool.get(k) ?? 0;
    if (have > 0) pool.set(k, have - 1); else missing += 1;
  }
  const left = [...pool.values()].reduce((a, b) => a + b, 0);
  const colorless = cost.filter((t) => t.toLowerCase() === "colorless").length;
  missing += Math.max(0, colorless - left);
  return { met: missing === 0, missing };
}

export const energyTotal = (attached: Record<string, number>) => Object.values(attached).reduce((a, n) => a + Math.max(0, n), 0);

// ─── damage ───────────────────────────────────────────────────────────────────

export interface DamageStep { label: string; value: number }
export interface DamageResult { base: number; steps: DamageStep[]; total: number; varies: boolean }

function modifier(value: string): { kind: "×" | "+" | "-"; n: number } | null {
  const m = value.replace(/x/gi, "×").replace(/\s/g, "").match(/^([×+-])(\d+)$/);
  return m ? { kind: m[1] as "×" | "+" | "-", n: Number(m[2]) } : null;
}

/**
 * An attack's damage to a Pokémon, in the rulebook's order: the printed
 * damage, then Weakness (×2 on current cards; "+20" on TCG Pocket cards),
 * then Resistance (−30), never below 0. Weakness and Resistance only count
 * against the Active Pokémon. `extra` is the players' own adjustment for card
 * effects we can't see (applied before Weakness, like effects on the
 * attacker). `varies` = the printed damage has a +, × or − the text explains.
 */
export function attackDamage(input: {
  attack: CardAttack;
  attackerTypes: string[];
  defender: Pick<CardRules, "weaknesses" | "resistances"> | null;
  defenderIsActive: boolean;
  extra?: number;
}): DamageResult {
  const base = input.attack.damage?.base ?? 0;
  const steps: DamageStep[] = [];
  let total = base;
  if (input.extra) { total += input.extra; steps.push({ label: input.extra > 0 ? `+${input.extra} from card effects` : `${input.extra} from card effects`, value: total }); }
  const types = new Set(input.attackerTypes.map((t) => t.toLowerCase()));
  if (input.defender && input.defenderIsActive && total > 0) {
    for (const w of input.defender.weaknesses) {
      if (!types.has(w.type.toLowerCase())) continue;
      const m = modifier(w.value) ?? { kind: "×" as const, n: 2 };
      total = m.kind === "×" ? total * m.n : m.kind === "+" ? total + m.n : total - m.n;
      steps.push({ label: `${m.kind === "×" ? `×${m.n}` : `${m.kind}${m.n}`} Weakness`, value: total });
      break;
    }
    for (const r of input.defender.resistances) {
      if (!types.has(r.type.toLowerCase())) continue;
      const m = modifier(r.value) ?? { kind: "-" as const, n: 30 };
      total = m.kind === "-" ? total - m.n : m.kind === "×" ? total * m.n : total + m.n;
      steps.push({ label: `${m.kind}${m.n} Resistance`, value: Math.max(0, total) });
      break;
    }
  }
  total = Math.max(0, total);
  return { base, steps, total, varies: !!input.attack.damage?.mod };
}

// ─── turns ────────────────────────────────────────────────────────────────────

/** Once-a-turn things, and whether the player attacked (which ends the turn). */
export interface TurnUsed { energy: boolean; supporter: boolean; stadium: boolean; retreat: boolean; attacked: boolean }
export const FRESH_TURN: TurnUsed = { energy: false, supporter: false, stadium: false, retreat: false, attacked: false };

/** Whose turn and which: `number` counts every turn of the game from 1 (the first player's first turn). */
export interface TurnState { number: number; player: PlayerId; first: PlayerId; used: TurnUsed }

export const nextPlayer = (p: PlayerId): PlayerId => (p === "p1" ? "p2" : "p1");

/** Each player's first turn: turn 1 for whoever went first, turn 2 for the other. */
export const isPlayersFirstTurn = (turn: TurnState) => turn.number <= 2;
export const wentFirstThisTurn = (turn: TurnState) => turn.number === 1;

/** Slot facts a reminder needs. */
export interface PieceFacts {
  name: string | null;
  enteredTurn: number | null;
  conditions: string[];
  energy: Record<string, number>;
  rules: CardRules | null;
}

const asleepOrParalyzed = (p: PieceFacts) => p.conditions.find((c) => /asleep|paralyzed/i.test(c)) ?? null;

export function reminderEnergy(turn: TurnState, who: string): string | null {
  return turn.used.energy ? `${who} already attached an Energy this turn. The rules allow one from your hand a turn, unless a card says otherwise.` : null;
}

export function reminderSupporter(turn: TurnState, who: string): string | null {
  if (wentFirstThisTurn(turn)) return `${who} went first: no Supporter on the very first turn.`;
  return turn.used.supporter ? `${who} already played a Supporter. The rules allow one a turn, unless a card in play says otherwise.` : null;
}

export function reminderStadium(turn: TurnState, who: string): string | null {
  return turn.used.stadium ? `${who} already played a Stadium this turn. One a turn.` : null;
}

export function reminderRetreat(turn: TurnState, who: string, piece: PieceFacts): string | null {
  const stuck = asleepOrParalyzed(piece);
  if (stuck) return `${piece.name ?? "This Pokémon"} is ${stuck}: it can't retreat.`;
  if (turn.used.retreat) return `${who} already retreated this turn. Once a turn.`;
  const cost = piece.rules?.retreat ?? 0;
  if (cost > energyTotal(piece.energy)) return `Retreating ${piece.name ?? "this Pokémon"} costs ${cost} Energy and it has ${energyTotal(piece.energy)}.`;
  return null;
}

export function reminderAttack(turn: TurnState, who: string, piece: PieceFacts, attack: CardAttack | null): string | null {
  if (wentFirstThisTurn(turn)) return `${who} went first: no attacking on the very first turn.`;
  if (turn.used.attacked) return `${who} already attacked: attacking ends the turn.`;
  const stuck = asleepOrParalyzed(piece);
  if (stuck) return `${piece.name ?? "This Pokémon"} is ${stuck}: it can't attack.`;
  if (attack) {
    const e = energyCheck(attack.cost, piece.energy);
    if (!e.met) return `${attack.name} needs ${e.missing} more Energy.`;
  }
  return null;
}

export function reminderEvolve(turn: TurnState, piece: PieceFacts): string | null {
  if (isPlayersFirstTurn(turn)) return "Nobody evolves on their first turn.";
  if (piece.enteredTurn === turn.number) return `${piece.name ?? "This Pokémon"} came into play this turn: it can evolve next turn.`;
  return null;
}
