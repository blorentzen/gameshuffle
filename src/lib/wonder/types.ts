/**
 * Super Mario Bros. Wonder randomizer types (game space picks 2026-11-11). Client-safe and pure.
 *
 * Wonder is four-player couch co-op with no winner, so the randomizer turns a play-through into a challenge night:
 * a character and a badge for each player, a level from a world, and a rule or two for the next levels.
 */

/** The game's worlds, plus Bellabel Park (Switch 2 Edition, where Ludwig's Showdown! is). */
export type WonderWorldId =
  | "pipe-rock-plateau" | "fluff-puff-peaks" | "shining-falls" | "sunbaked-desert" | "fungi-mines" | "deep-magma-bog"
  | "petal-isles" | "special-world" | "bellabel-park";

export interface WonderWorld {
  id: WonderWorldId;
  name: string;
  /** World 1 to 6; null for the Petal Isles, the Special World and Bellabel Park. */
  number: number | null;
  /** Our own color for its level cards (dark enough for white text). */
  color: string;
  /** Only in the Nintendo Switch 2 Edition. */
  switch2?: boolean;
}

export interface WonderCharacter {
  name: string;
  /** Its picture: public/images/super-mario-bros-wonder/characters/<slug>.webp */
  slug: string;
  /** The tile color behind its picture. */
  color: string;
  /** The Yoshis and Nabbit: no damage from most enemies and hazards, and no power-up forms. */
  noDamage?: boolean;
  /** Only in the Nintendo Switch 2 Edition (Rosalina). */
  switch2?: boolean;
}

/** The game's own badge groups. Dual Badges are Switch 2 Edition only. (Support Badges only work in Bellabel Park's
 *  attractions, not in courses, so they aren't rolled.) */
export type WonderBadgeType = "action" | "boost" | "expert" | "dual";

export interface WonderBadge {
  name: string;
  /** Its picture: public/images/super-mario-bros-wonder/badges/<slug>.webp */
  slug: string;
  type: WonderBadgeType;
  /** What it does, in our words. */
  what: string;
  /** Where you first get it (plain words, for the data's readers). */
  where: string;
  /** Can be had in the first world, Pipe-Rock Plateau ("First world only" keeps these). */
  first?: boolean;
  /** Only after the final battle with Bowser or later ("Before the ending" leaves these out). */
  late?: boolean;
  /** Only in the Nintendo Switch 2 Edition. */
  switch2?: boolean;
  /** Changes nothing but the voices you hear (Sound Off?). */
  cosmetic?: boolean;
  /** A Dual Badge: the two badges it gives at once. */
  parts?: [string, string];
}

/** What a level is, as the game sorts them. Rolls keep to courses, palaces, battleships and boss levels by default. */
export type WonderLevelType =
  | "course" | "palace" | "battleship" | "boss" | "showdown"
  | "badge" | "break" | "search" | "ko" | "wiggler";

export interface WonderLevel {
  name: string;
  world: WonderWorldId;
  type: WonderLevelType;
  /** The game's star rating, 1 to 5; null for levels without one (Break Time!, Search Parties, KO Arenas). */
  stars: number | null;
  /** Only in the Nintendo Switch 2 Edition. */
  switch2?: boolean;
}

/** Each roll takes at most one rule of a kind, so rules never fight (no badges and the same badge for everyone). */
export type WonderRuleKind = "lives" | "badges" | "power" | "play" | "team";
/** How long a rule lasts. */
export type WonderRuleLasts = "level" | "three" | "night";

export interface WonderRule {
  id: string;
  kind: WonderRuleKind;
  title: string;
  /** One sentence on how it works. `{badge}` is the badge a "same badge" rule rolled. */
  detail: string;
  lasts: WonderRuleLasts;
  /** Rules that change what the player cards show: everyone without a badge, or everyone on one badge. */
  badge?: "none" | "same";
}

export interface WonderGame {
  slug: "super-mario-bros-wonder";
  name: string;
  /** The Pacific day the data was last checked. */
  checkedOn: string;
  /** Where the pictures live (public/). */
  assetBase: string;
  worlds: WonderWorld[];
  characters: WonderCharacter[];
  badges: WonderBadge[];
  levels: WonderLevel[];
  rules: WonderRule[];
}
