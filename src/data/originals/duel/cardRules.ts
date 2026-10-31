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

import type { DuelCard, DuelCondition, DuelMove, DuelMoveFx, DuelPlus, DuelPlusKind, EnergyType } from "@/lib/originals/duel/types";

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

/**
 * A "+" or "×" attack's text as the Duel plays it (rules 5; picks 2026-10-22, https://claude.ai/artifact/MFwJQi5RBdq92B1JKS2EWZ):
 * what it counts and how much each one adds. Only wordings the Duel can follow exactly: the trainer's
 * or your waiting cards, cards in play, Energy and damage on either card, Energy beyond the cost, an ex,
 * a type, conditions, cards knocked out, a card sent in this turn. Coins, discards, hands, Abilities,
 * evolutions and anything else keep the printed number (undefined).
 */
export function plusOf(damage: unknown, text: unknown): DuelPlus | undefined {
  const printed = String(damage ?? "").trim();
  const op = /\+$/.test(printed) ? "+" : /[×x]$/i.test(printed) ? "x" : null;
  if (!op || typeof text !== "string" || !text) return undefined;
  const clean = text.replace(/\([^)]*\)/g, (m) => (/both yours and your opponent's/i.test(m) ? m : " ")).replace(/[’‘]/g, "'").replace(/Pok[eé]mon/g, "Pokémon").replace(/\s+/g, " ").trim();
  // A card sent in this turn (in the Duel: after a knockout).
  const arrived = clean.match(/^If this Pokémon moved from your Bench to the Active Spot this turn, this attack does (\d+) more damage\.?$/i);
  if (arrived && op === "+") return { op, kind: "arrived", per: Number(arrived[1]), flat: true };
  if (/flip|discard|Stadium|your hand|opponent's hand|discard pile|last turn|Prize cards remaining|Ability|Round attack|Tool|Supporter|Lost Zone|this turn|heads|Evolved|Retreat Cost|Resistance|You may do/i.test(clean)) return undefined;
  const isFoe = (x: string) => /^(?:your opponent's Active Pokémon|the Defending Pokémon)$/i.test(x);
  // "this Pokémon", "all of your Active Pokémon" or the card's own name ("Blastoise"; case matters).
  const isSelf = (x: string) => /^(?:this Pokémon|all of your Active Pokémon)$/i.test(x) || /^[A-Z][a-zé'.-]+$/.test(x);
  const cap = clean.match(/You can't add more than (\d+) damage/i);
  const capped = (p: DuelPlus): DuelPlus => (cap ? { ...p, max: Number(cap[1]) } : p);
  // Counting: "N more damage for each X", "N damage for each X", "N (more) damage times the number/amount of X".
  const each = clean.match(/(\d+) more damage for each (.+?)\./i) ?? clean.match(/does (\d+) damage for each (.+?)\./i)
    ?? clean.match(/(\d+) (more )?damage times the (?:number|amount) of (.+?)\./i);
  if (each) {
    const per = Number(each[1]);
    const what = (each[3] ?? each[2]).trim();
    const plusOp = /more damage/i.test(each[0]) ? "+" : "x";
    if (plusOp !== op) return undefined;
    const kinds: [RegExp, DuelPlusKind][] = [
      [/^(?:of )?your opponent's Benched Pokémon$|^Pokémon on your opponent's Bench$/i, "foeBench"],
      [/^(?:of )?your opponent's Pokémon(?: in play)?$/i, "foeLeft"],
      [/^(?:of )?your Benched Pokémon$|^Pokémon on your Bench$/i, "youBench"],
      [/^(?:of )?your Pokémon in play$/i, "youLeft"],
      [/^Benched Pokémon \(both yours and your opponent's\)$/i, "bothBench"],
      [/^Pokémon in play \(both yours and your opponent's\)$/i, "bothLeft"],
      [/^Prize cards? your opponent has taken$/i, "youLost"],
      [/^Prize cards? you have taken$/i, "foeLost"],
    ];
    for (const [re, kind] of kinds) if (re.test(what)) return capped({ op, kind, per });
    const spare = what.match(/^(?:(\w+) )?Energy attached to (.+?) but not used to pay for this attack's Energy Cost$/i);
    if (spare && isSelf(spare[2])) {
      const t = spare[1] ? energyOf(spare[1]) : null;
      if (spare[1] && !/^basic$/i.test(spare[1]) && !t) return undefined;
      return capped(t ? { op, kind: "spareEnergy", per, t } : { op, kind: "spareEnergy", per });
    }
    const energy = what.match(/^(?:basic )?(?:(\w+) )?Energy (?:card )?attached to (.+)$/i);
    if (energy) {
      const t = energy[1] ? energyOf(energy[1]) : null;
      if (energy[1] && !t) return undefined;
      const kind: DuelPlusKind | null = isFoe(energy[2]) ? "foeEnergy" : isSelf(energy[2]) ? "selfEnergy" : null;
      if (!kind) return undefined;
      return capped(t ? { op, kind, per, t } : { op, kind, per });
    }
    const counters = what.match(/^damage counter on (.+)$/i);
    if (counters) {
      const kind: DuelPlusKind | null = isFoe(counters[1]) ? "foeDamage" : isSelf(counters[1]) ? "selfDamage" : null;
      return kind ? capped({ op, kind, per }) : undefined;
    }
    const conds = what.match(/^Special Condition affecting (.+)$/i);
    if (conds) {
      const kind: DuelPlusKind | null = isFoe(conds[1]) ? "foeCond" : isSelf(conds[1]) ? "selfCond" : null;
      return kind ? capped({ op, kind, per }) : undefined;
    }
    return undefined;
  }
  // Once, when something is true: "If …, this attack does N more damage" (also "does 40 damage plus 40 more damage").
  if (op !== "+") return undefined;
  const flat = clean.match(/^If (.+?), this attack does (?:\d+ damage plus )?(\d+) more damage\./i);
  if (!flat) return undefined;
  const cond = flat[1].trim();
  const per = Number(flat[2]);
  const foe = "(?:your opponent's Active Pokémon|the Defending Pokémon)";
  if (new RegExp(`^${foe} is (?:a )?Pokémon(?:-| )(?:ex|EX|V|GX)$`, "i").test(cond)) return { op, kind: "foeEx", per, flat: true };
  const typeIs = cond.match(new RegExp(`^${foe} is an? (\\w+) Pokémon$`, "i"));
  if (typeIs) { const t = energyOf(typeIs[1]); return t ? { op, kind: "foeType", per, flat: true, t } : undefined; }
  if (new RegExp(`^${foe} is affected by a Special Condition$`, "i").test(cond)) return { op, kind: "foeCond", per, flat: true };
  const word = (w: string) => CONDITION_WORD[w.toLowerCase()];
  const foeIs = cond.match(new RegExp(`^${foe} is (Burned|Poisoned|Paralyzed|Asleep|Confused)(?: or (Burned|Poisoned|Paralyzed|Asleep|Confused))?$`, "i"));
  if (foeIs) return { op, kind: "foeCond", per, flat: true, conds: [word(foeIs[1]), ...(foeIs[2] ? [word(foeIs[2])] : [])] };
  if (/^this Pokémon is affected by a Special Condition$/i.test(cond)) return { op, kind: "selfCond", per, flat: true };
  const selfIs = cond.match(/^this Pokémon is (Burned|Poisoned|Paralyzed|Asleep|Confused)(?: or (Burned|Poisoned|Paralyzed|Asleep|Confused))?$/i);
  if (selfIs) return { op, kind: "selfCond", per, flat: true, conds: [word(selfIs[1]), ...(selfIs[2] ? [word(selfIs[2])] : [])] };
  if (/^this Pokémon has (?:any )?damage counters on it$/i.test(cond)) return { op, kind: "selfDamage", per, flat: true };
  if (new RegExp(`^${foe} (?:already )?has (?:any )?damage counters on it$`, "i").test(cond)) return { op, kind: "foeDamage", per, flat: true };
  const hasEnergy = cond.match(/^this Pokémon has (?:any )?(\w+) Energy attached(?: to it)?$/i);
  if (hasEnergy) { const t = energyOf(hasEnergy[1]); return t ? { op, kind: "selfEnergy", per, flat: true, t } : undefined; }
  return undefined;
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
    const plus = plusOf(a.damage, a.text);
    const move: DuelMove = { n: a.name.trim(), cost, d };
    if (fx.length) move.fx = fx;
    if (plus) move.plus = plus;
    moves.push(move);
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
