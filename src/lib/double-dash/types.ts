/**
 * Types for the Mario Kart: Double Dash!! randomizer. Client-safe, no data.
 */

/** Weight classes: every character has one, and every kart but the Parade Kart. */
export type DdClass = "Light" | "Medium" | "Heavy";

/** The special items, by what a pair gets from Item Boxes. Petey Piranha and King Boo get "any" of them. */
export type DdSpecial =
  | "fireballs-red" | "fireballs-green" | "heart" | "yoshi-egg" | "birdo-egg" | "chain-chomp" | "triple-shells"
  | "giant-banana" | "bowsers-shell" | "bob-omb" | "golden-mushroom" | "any";

export interface DdCharacter {
  name: string;
  /** File name under the game's art folder (characters/<slug>.webp). */
  slug: string;
  weight: DdClass;
  special: DdSpecial;
  /** The game's own teams (Mario and Luigi, Peach and Daisy...), for "only the game's own pairs". */
  team: string;
  /** Unlocked by playing (Toad and Toadette, Petey Piranha and King Boo); the rest are there from the start. */
  unlock?: string;
  /** The tile colour behind the character's picture. */
  color: string;
}

export interface DdKart {
  name: string;
  slug: string;
  /** The weight class it belongs to; null = any pair can drive it (the Parade Kart). */
  weight: DdClass | null;
  /** The character it belongs to, as the game pairs them. */
  owner: string | null;
  unlock?: string;
}

export interface DdCourse {
  name: string;
  slug: string;
  /** Laps in a race: 3, but Baby Park has 7 and Wario Colosseum 2. */
  laps: number;
}

export interface DdCup {
  name: string;
  slug: string;
  courses: DdCourse[];
  unlock?: string;
}

export interface DdBattleCourse {
  name: string;
  slug: string;
  unlock?: string;
}

export interface DdBattleMode {
  id: "balloon" | "shine" | "bobomb";
  name: string;
  slug: string;
  /** One line on how it's won. */
  line: string;
}

export interface DdSpecialInfo {
  name: string;
  /** Icon under items/<slug>.webp (Petey Piranha and King Boo's "any" has none). */
  slug: string | null;
}

export interface DdGame {
  slug: "mario-kart-double-dash";
  name: string;
  /** Where the art lives (`${assetBase}characters/mario.webp`). */
  assetBase: string;
  checkedOn: string;
  characters: DdCharacter[];
  karts: DdKart[];
  cups: DdCup[];
  battleCourses: DdBattleCourse[];
  battleModes: DdBattleMode[];
  engines: string[];
  specials: Record<DdSpecial, DdSpecialInfo>;
}
