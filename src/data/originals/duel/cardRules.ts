/**
 * Daily Duel: how a catalog card (`tcg_cards`) becomes a DuelCard. Pure and client-safe, shared by
 * scripts/populate-duel-cards.ts (which cards can play), scripts/build-duel-cards.ts (writes
 * cards.generated.ts) and scripts/test-duel-data.ts. Only the printed numbers count: type, HP,
 * Weakness, and each move's Energy cost and damage ("130+" counts as 130, "50×" as 50). An attack
 * whose damage is written in its text and nothing else ("This attack does 30 damage to 2 of your
 * opponent's Pokémon") plays as that hit on the card in play (textDamage; Britton, 2026-10-22, after a
 * player expected Kyogre's Dual Splash to work). Text with any condition, cost or bench-only target
 * stays out.
 */

import type { DuelCard, DuelCondition, DuelMove, DuelMoveFx, EnergyType } from "@/lib/originals/duel/types";

/** The columns of `tcg_cards` the duel reads. */
export interface DuelCatalogRow {
  id: string;
  name: string;
  supertype: string | null;
  subtypes: string[] | null;
  types: string[] | null;
  hp: string | null;
  attacks: unknown;
  weaknesses: unknown;
  rarity?: string | null;
  language_code: string | null;
  images: { small?: string; medium?: string } | null;
}

/** A move needing more Energy than this is never the only way a card can hit (one Energy a turn). */
export const MAX_MOVE_COST = 4;

/** Fairy (XY to Sun & Moon) plays as Psychic, as it does in today's game. */
const ENERGY: Record<string, EnergyType> = {
  grass: "Grass", fire: "Fire", water: "Water", lightning: "Lightning", psychic: "Psychic",
  fighting: "Fighting", darkness: "Darkness", metal: "Metal", dragon: "Dragon", colorless: "Colorless",
  fairy: "Psychic",
};

export function energyOf(x: unknown): EnergyType | null {
  return typeof x === "string" ? ENERGY[x.trim().toLowerCase()] ?? null : null;
}

/** The printed damage as a number: "130+" → 130, "50×" → 50, "" / null → 0. */
export function damageOf(x: unknown): number {
  const m = String(x ?? "").match(/\d+/);
  return m ? Number(m[0]) : 0;
}

/** Multi-prize and rule-box marks. */
const RULE_BOX = new Set(["ex", "EX", "GX", "V", "VMAX", "VSTAR", "V-UNION", "TAG TEAM", "MEGA", "BREAK", "LEGEND", "Level-Up", "Prism Star", "Radiant", "Star"]);

export function isRuleBox(subtypes: string[] | null | undefined, name = ""): boolean {
  return (subtypes ?? []).some((s) => RULE_BOX.has(s)) || /\b(ex|EX|GX|V|VMAX|VSTAR)$/.test(name.trim());
}

/** English printed cards only: no Japanese prints, no TCG Pocket. */
export function isEnglishPrint(row: Pick<DuelCatalogRow, "id" | "language_code">): boolean {
  return /^en/i.test(row.language_code ?? "") && !row.id.startsWith("tcgp") && !/_ja-/.test(row.id);
}

/** A trainer's own card ("Cynthia's Garchomp ex"). */
export const OWNER_PREFIX = /^(.+?)'s\s+/;

/** "Cynthia's Garchomp ex" → "Garchomp ex" when the full name is long; short names stay whole. */
export function shortName(name: string): string {
  const clean = name.replace(/[’‘]/g, "'").trim();
  return clean.length > 16 ? clean.replace(OWNER_PREFIX, "") : clean;
}

interface RawAttack { name?: unknown; cost?: unknown; damage?: unknown; text?: unknown }

/** The whole text of an attack that only does damage to the opponent's Pokémon (the reminder in parentheses aside). */
const TEXT_DAMAGE: RegExp[] = [
  /^This attack does (\d+) damage to (?:1|2|each) of your opponent's Pokémon\.$/i,
  /^This attack does (\d+) damage to each of 2 of your opponent's Pokémon\.$/i,
  /^Choose (?:1|2) of your opponent's Pokémon\. This attack does (\d+) damage to (?:that Pokémon|each of them)\.$/i,
  /^Does (\d+) damage to each Defending Pokémon\.$/i,
];

/**
 * The damage an attack's text does when that's all it does: "This attack does 30 damage to 2 of
 * your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)" → 30. Null for
 * anything else (a condition, a discard, a coin, a bench-only target, an effect).
 */
export function textDamage(text: unknown): number | null {
  if (typeof text !== "string") return null;
  const clean = text.replace(/\([^)]*\)/g, " ").replace(/[’‘]/g, "'").replace(/Pok[eé]mon/g, "Pokémon").replace(/\s+/g, " ").trim();
  for (const re of TEXT_DAMAGE) {
    const m = clean.match(re);
    if (m) return Number(m[1]);
  }
  return null;
}
interface RawWeakness { type?: unknown }

const CONDITION_WORD: Record<string, DuelCondition> = { burned: "burned", poisoned: "poisoned", paralyzed: "paralyzed", asleep: "asleep", confused: "confused" };
const TARGET = "(?:your opponent's Active Pokémon|the Defending Pokémon)";
const CONDS = "(Burned|Poisoned|Paralyzed|Asleep|Confused)(?:,? and (Burned|Poisoned|Paralyzed|Asleep|Confused))?";
/** "Your opponent's Active Pokémon is now Paralyzed." (also "The Defending Pokémon …", and "X and Y"). */
const SURE = new RegExp(`(?:^|\\. )${TARGET} is now ${CONDS}\\.`, "i");
/** "Flip a coin. If heads, your opponent's Active Pokémon is now Paralyzed." */
const COIN = new RegExp(`(?:^|\\. )Flip a coin\\. If heads, ${TARGET} is now ${CONDS}\\.`, "i");

/**
 * The conditions an attack's text puts on the card it hits, in the two wordings the Duel plays:
 * always ("… is now Paralyzed.") and on a coin ("Flip a coin. If heads, … is now Paralyzed.").
 * Anything with a condition of its own ("If the Defending Pokémon is…", "If tails…", two coins) and
 * conditions on the attacker itself stay out: the card's other words are flavor, as before.
 */
export function conditionsOf(text: unknown): DuelMoveFx[] {
  if (typeof text !== "string" || !text) return [];
  const clean = text.replace(/\([^)]*\)/g, " ").replace(/[’‘]/g, "'").replace(/Pok[eé]mon/g, "Pokémon").replace(/\s+/g, " ").trim();
  if (/If tails/i.test(clean)) return [];
  const m = clean.match(COIN) ?? clean.match(SURE);
  if (!m) return [];
  const coin = /^(?:\. )?Flip a coin/i.test(m[0]);
  const out: DuelMoveFx[] = [];
  for (const w of [m[1], m[2]]) {
    const c = w ? CONDITION_WORD[w.toLowerCase()] : undefined;
    if (c && !out.some((x) => x.c === c)) out.push(coin ? { c, coin: true } : { c });
  }
  return out;
}

/** The card as the duel plays it, or null when it can't play (not a Pokémon, no type or HP, no damaging move). */
export function toDuelCard(row: DuelCatalogRow): DuelCard | null {
  if (!/^pok/i.test(row.supertype ?? "")) return null;
  const t = energyOf((row.types ?? [])[0]);
  const hp = damageOf(row.hp);
  if (!t || !hp) return null;
  const moves: DuelMove[] = [];
  for (const a of (Array.isArray(row.attacks) ? row.attacks : []) as RawAttack[]) {
    const d = damageOf(a.damage) || textDamage(a.text) || 0;
    if (!d || typeof a.name !== "string") continue;
    const cost = (Array.isArray(a.cost) ? a.cost : []).map((c) => energyOf(c) ?? "Colorless");
    const fx = conditionsOf(a.text);
    moves.push(fx.length ? { n: a.name.trim(), cost, d, fx } : { n: a.name.trim(), cost, d });
  }
  if (!moves.length) return null;
  const weak = energyOf(((Array.isArray(row.weaknesses) ? row.weaknesses : []) as RawWeakness[])[0]?.type);
  const name = row.name.replace(/[’‘]/g, "'").trim();
  return {
    id: row.id,
    name,
    short: shortName(name),
    t,
    hp,
    weak,
    ex: isRuleBox(row.subtypes, name),
    moves,
    img: row.images?.medium ?? row.images?.small ?? null,
  };
}

/**
 * Every attack on the card plays in the duel as printed: a printed damage number, or text that only
 * does damage (textDamage). A card with an attack that only draws, heals, searches or adds a
 * condition shows a move the duel can't play, so prints like that are picked last (Britton,
 * 2026-10-22: "find cards that clean lines through attacks").
 */
export function cleanAttacks(row: Pick<DuelCatalogRow, "attacks">): boolean {
  const attacks = (Array.isArray(row.attacks) ? row.attacks : []) as RawAttack[];
  return attacks.every((a) => damageOf(a.damage) > 0 || textDamage(a.text) !== null);
}

/** Can hit with at least one move costing MAX_MOVE_COST Energy or less. */
export function canHit(card: DuelCard): boolean {
  return card.moves.some((m) => m.d > 0 && m.cost.length <= MAX_MOVE_COST);
}

/** Usable anywhere in the duel: English print, plays, can hit, has a picture. */
export function duelReady(row: DuelCatalogRow): DuelCard | null {
  if (!isEnglishPrint(row)) return null;
  const card = toDuelCard(row);
  return card && canHit(card) && card.img ? card : null;
}
