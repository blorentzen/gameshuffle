/**
 * Daily Duel: how a catalog card (`tcg_cards`) becomes a DuelCard. Pure and client-safe, shared by
 * scripts/populate-duel-cards.ts (which cards can play), scripts/build-duel-cards.ts (writes
 * cards.generated.ts) and scripts/test-duel-data.ts. Only the printed numbers count: type, HP,
 * Weakness, and each move's Energy cost and damage ("130+" counts as 130, "50×" as 50).
 */

import type { DuelCard, DuelMove, EnergyType } from "@/lib/originals/duel/types";

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

interface RawAttack { name?: unknown; cost?: unknown; damage?: unknown }
interface RawWeakness { type?: unknown }

/** The card as the duel plays it, or null when it can't play (not a Pokémon, no type or HP, no damaging move). */
export function toDuelCard(row: DuelCatalogRow): DuelCard | null {
  if (!/^pok/i.test(row.supertype ?? "")) return null;
  const t = energyOf((row.types ?? [])[0]);
  const hp = damageOf(row.hp);
  if (!t || !hp) return null;
  const moves: DuelMove[] = [];
  for (const a of (Array.isArray(row.attacks) ? row.attacks : []) as RawAttack[]) {
    const d = damageOf(a.damage);
    if (!d || typeof a.name !== "string") continue;
    const cost = (Array.isArray(a.cost) ? a.cost : []).map((c) => energyOf(c) ?? "Colorless");
    moves.push({ n: a.name.trim(), cost, d });
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
