/**
 * Super Mario Bros. Wonder rolls (game space picks 2026-11-11): a character and a badge for each player, a level from a
 * world, and challenge rules. Pure and client-safe, shared by the randomizer, chat and the space; `rng` is injectable
 * for tests.
 */

import { pick, shuffle, type Rng } from "@/lib/party/roll";
import type {
  WonderBadge, WonderBadgeType, WonderCharacter, WonderGame, WonderLevel, WonderLevelType, WonderRule, WonderRuleKind,
  WonderRuleLasts, WonderWorld, WonderWorldId,
} from "@/lib/wonder/types";

export type { Rng };

// ── Labels ──────────────────────────────────────────────────────────────────

export const BADGE_TYPE_LABEL: Record<WonderBadgeType, string> = {
  action: "Action Badge", boost: "Boost Badge", expert: "Expert Badge", dual: "Dual Badge",
};
/** The badge group colors on the cards (our own, after the game's badge shapes: orange, blue, purple, red). */
export const BADGE_TYPE_COLOR: Record<WonderBadgeType, string> = {
  action: "#c4561a", boost: "#2a62c4", expert: "#7a45b4", dual: "#b52f55",
};
export const LEVEL_TYPE_LABEL: Record<WonderLevelType, string> = {
  course: "Course", palace: "Palace", battleship: "Flying Battleship", boss: "Final battle", showdown: "Koopaling showdown",
  badge: "Badge Challenge", break: "Break Time!", search: "Search Party", ko: "KO Arena", wiggler: "Wiggler Race",
};
export const LASTS_LABEL: Record<WonderRuleLasts, string> = { level: "This level", three: "Next three levels", night: "All night" };
export const RULE_KIND_LABEL: Record<WonderRuleKind, string> = {
  lives: "Lives", badges: "Badges", power: "Power-ups", play: "How you play", team: "Together",
};

/** Level types a roll takes by default: the courses, plus the world's palace, battleship and boss levels. Badge
 *  Challenges, Break Time!, Search Parties, KO Arenas and Wiggler Races wait until someone turns them on. */
export const DEFAULT_LEVEL_TYPES: WonderLevelType[] = ["course", "palace", "battleship", "boss", "showdown"];

/** The level type chips in the options, grouped the way people talk about them. */
export const LEVEL_GROUPS: { id: string; label: string; types: WonderLevelType[]; switch2?: boolean }[] = [
  { id: "course", label: "Courses", types: ["course"] },
  { id: "bosses", label: "Palaces, battleships and Bowser", types: ["palace", "battleship", "boss"] },
  { id: "showdown", label: "Koopaling showdowns", types: ["showdown"], switch2: true },
  { id: "badge", label: "Badge Challenges", types: ["badge"] },
  { id: "break", label: "Break Time!", types: ["break"] },
  { id: "search", label: "Search Parties", types: ["search"] },
  { id: "ko", label: "KO Arenas", types: ["ko"] },
  { id: "wiggler", label: "Wiggler Races", types: ["wiggler"] },
];

/** "World 1: Pipe-Rock Plateau", or the name for the Petal Isles, Special World and Bellabel Park. */
export function worldLabel(w: Pick<WonderWorld, "name" | "number">): string {
  return w.number ? `World ${w.number}: ${w.name}` : w.name;
}

export function worldOf(game: WonderGame, id: WonderWorldId): WonderWorld {
  return game.worlds.find((w) => w.id === id) ?? game.worlds[0];
}

/** The worlds to choose from (Bellabel Park only with the Switch 2 Edition). */
export function worldsFor(game: WonderGame, switch2: boolean): WonderWorld[] {
  return game.worlds.filter((w) => switch2 || !w.switch2);
}

// ── Pools ───────────────────────────────────────────────────────────────────

export interface CharacterOptions {
  /** The Nintendo Switch 2 Edition: adds Rosalina. */
  switch2?: boolean;
  /** The Yoshis and Nabbit (they take no damage). On by default. */
  noDamage?: boolean;
}

export function characterPool(game: WonderGame, o: CharacterOptions = {}): WonderCharacter[] {
  return game.characters.filter((c) => (o.switch2 || !c.switch2) && (o.noDamage !== false || !c.noDamage));
}

/** Which badges a group has: every badge, every badge before the ending, or only what the first world gives. */
export type BadgeSet = "all" | "before-ending" | "first-world";

export interface BadgeOptions {
  switch2?: boolean;
  /** Badge groups to roll from; empty = every group (Dual Badges only with the Switch 2 Edition). */
  types?: WonderBadgeType[];
  set?: BadgeSet;
  /** Sound Off? (it only changes voices). On by default. */
  soundOff?: boolean;
}

export function badgePool(game: WonderGame, o: BadgeOptions = {}): WonderBadge[] {
  const types = o.types?.length ? o.types : null;
  const set = o.set ?? "all";
  return game.badges.filter((b) =>
    (o.switch2 || !b.switch2)
    && (!types || types.includes(b.type))
    && (set !== "first-world" || !!b.first)
    && (set !== "before-ending" || !b.late)
    && (o.soundOff !== false || !b.cosmetic));
}

export interface LevelOptions {
  switch2?: boolean;
  /** One world, or every world (null). */
  world?: WonderWorldId | null;
  /** Level types; empty = DEFAULT_LEVEL_TYPES. */
  types?: WonderLevelType[];
  /** Star ratings to keep (1 to 5); empty = any. Levels the game doesn't rate always stay in. */
  stars?: number[];
}

export function levelPool(game: WonderGame, o: LevelOptions = {}): WonderLevel[] {
  const types = o.types?.length ? o.types : DEFAULT_LEVEL_TYPES;
  const stars = o.stars?.length ? o.stars : null;
  return game.levels.filter((l) =>
    (o.switch2 || !l.switch2)
    && (!o.world || l.world === o.world)
    && types.includes(l.type)
    && (!stars || l.stars === null || stars.includes(l.stars)));
}

/** Rules of the kinds asked for (empty = every kind). */
export function rulePool(game: WonderGame, kinds: WonderRuleKind[] = []): WonderRule[] {
  return kinds.length ? game.rules.filter((r) => kinds.includes(r.kind)) : game.rules;
}

// ── Players ─────────────────────────────────────────────────────────────────

export interface WonderPick {
  character: string;
  /** Null when no badge fits the options. */
  badge: string | null;
}

export interface PlayerOptions {
  /** The same badge on more than one player. Off by default (characters are always different, as in the game). */
  badgeRepeats?: boolean;
}

/** Up to `count` different things from `pool`, then repeats once it runs out. */
function deal<T>(pool: readonly T[], count: number, rng: Rng): T[] {
  if (!pool.length) return [];
  const out: T[] = [];
  while (out.length < count) out.push(...shuffle(pool, rng).slice(0, count - out.length));
  return out;
}

/** A character and a badge for each of `count` players: nobody shares a character, and badges differ unless repeats
 *  are on (both repeat only once their pool runs out). */
export function drawPlayers(
  characters: readonly WonderCharacter[], badges: readonly WonderBadge[], count: number, o: PlayerOptions = {}, rng: Rng = Math.random,
): WonderPick[] {
  const chars = deal(characters, count, rng);
  const bs = o.badgeRepeats ? Array.from({ length: count }, () => pick(badges, rng)) : deal(badges, count, rng);
  return chars.map((c, i) => ({ character: c.name, badge: bs[i]?.name ?? null }));
}

/** A new character and badge for one seat, different from what the other seats hold while the pools allow. */
export function drawSeat(
  characters: readonly WonderCharacter[], badges: readonly WonderBadge[], others: readonly WonderPick[], o: PlayerOptions = {}, rng: Rng = Math.random,
): WonderPick {
  const freeChars = characters.filter((c) => !others.some((p) => p.character === c.name));
  const freeBadges = o.badgeRepeats ? badges : badges.filter((b) => !others.some((p) => p.badge === b.name));
  const c = pick(freeChars.length ? freeChars : characters, rng);
  const b = pick(freeBadges.length ? freeBadges : badges, rng);
  return { character: c?.name ?? "", badge: b?.name ?? null };
}

// ── Levels ──────────────────────────────────────────────────────────────────

/** One level from the pool, a different one from `avoid` when there's a choice. */
export function rollLevel(pool: readonly WonderLevel[], avoid: string | null = null, rng: Rng = Math.random): WonderLevel | null {
  const others = pool.filter((l) => l.name !== avoid);
  return pick(others.length ? others : pool, rng) ?? null;
}

/** `count` levels with no repeats until the pool runs out. */
export function rollLevels(pool: readonly WonderLevel[], count: number, rng: Rng = Math.random): WonderLevel[] {
  return deal(pool, count, rng);
}

// ── Rules ───────────────────────────────────────────────────────────────────

/** A rule as rolled: its id, and the badge a "same badge" rule landed on. */
export interface RolledRule {
  id: string;
  badge?: string;
}

/** Fill in a rule as rolled (a "same badge" rule needs a badge, so it's left out when no badge fits). */
function rolled(rule: WonderRule, badges: readonly WonderBadge[], rng: Rng): RolledRule | null {
  if (rule.badge !== "same") return { id: rule.id };
  const b = pick(badges.filter((x) => !x.cosmetic), rng) ?? pick(badges, rng);
  return b ? { id: rule.id, badge: b.name } : null;
}

/** `count` rules, never two of a kind (so "no badges" never meets "same badge for everyone"). */
export function rollRules(rules: readonly WonderRule[], count: number, badges: readonly WonderBadge[], rng: Rng = Math.random): RolledRule[] {
  const out: RolledRule[] = [];
  const kinds = new Set<WonderRuleKind>();
  for (const r of shuffle(rules, rng)) {
    if (out.length >= count) break;
    if (kinds.has(r.kind)) continue;
    const one = rolled(r, badges, rng);
    if (!one) continue;
    out.push(one);
    kinds.add(r.kind);
  }
  return out;
}

/** A new rule for one spot: of a kind no other rule holds, and not the one it replaces while there's a choice. */
export function rerollRule(
  rules: readonly WonderRule[], current: readonly RolledRule[], index: number, badges: readonly WonderBadge[], rng: Rng = Math.random,
): RolledRule | null {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const held = new Set(current.filter((_, i) => i !== index).map((x) => byId.get(x.id)?.kind));
  const was = current[index]?.id;
  const open = rules.filter((r) => !held.has(r.kind));
  const fresh = open.filter((r) => r.id !== was);
  for (const r of shuffle(fresh.length ? fresh : open, rng)) {
    const one = rolled(r, badges, rng);
    if (one) return one;
  }
  return null;
}

export function ruleOf(game: WonderGame, r: RolledRule): WonderRule | undefined {
  return game.rules.find((x) => x.id === r.id);
}

/** A rule's sentence with its badge filled in. */
export function ruleDetail(rule: WonderRule, r: RolledRule): string {
  return rule.detail.replace("{badge}", r.badge ?? "one badge");
}

/** One line for chat and saved setups: "Same badge for everyone: Everyone wears Grappling Vine. (Next three levels)". */
export function ruleLine(rule: WonderRule, r: RolledRule): string {
  return `${rule.title}: ${ruleDetail(rule, r)} (${LASTS_LABEL[rule.lasts]})`;
}

/**
 * The badge a player wears with tonight's rules: their own, nobody's ("No badges"), or the one everyone shares.
 * `rule` names the rule that decided it.
 */
export function badgeWorn(game: WonderGame, own: string | null, rules: readonly RolledRule[]): { badge: string | null; rule: "none" | "same" | null } {
  for (const r of rules) {
    const rule = ruleOf(game, r);
    if (rule?.badge === "none") return { badge: null, rule: "none" };
    if (rule?.badge === "same" && r.badge) return { badge: r.badge, rule: "same" };
  }
  return { badge: own, rule: null };
}
