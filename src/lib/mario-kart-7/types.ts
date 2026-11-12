/**
 * Types for the Mario Kart 7 randomizer. Client-safe, no data.
 */

/** The game's five weight classes, lightest first. */
export type Mk7Class = "Feather" | "Light" | "Medium" | "Cruiser" | "Heavy";

/** Which parts the save has: the seven from the start, or every part (the coin unlocks and the gold parts). */
export type Mk7PartsLevel = "start" | "all";

export interface Mk7Character {
  name: string;
  /** File name under the game's art folder (characters/<slug>.webp). */
  slug: string;
  weight: Mk7Class;
  /** How it's unlocked; the eight without one are there from the start. */
  unlock?: string;
  /** The tile colour behind the character's picture. */
  color: string;
}

export interface Mk7Part {
  name: string;
  slug: string;
  /** How it's unlocked; the parts without one are there from the start. */
  unlock?: string;
}

export interface Mk7Course {
  /** The game's North American name: classic courses carry their console ("SNES Rainbow Road"). */
  name: string;
  slug: string;
  /** Raced as one lap in three sections (Wuhu Loop, Maka Wuhu, Rainbow Road) instead of three laps. */
  sections?: boolean;
}

export interface Mk7Cup {
  name: string;
  slug: string;
  kind: "new" | "classic";
  courses: Mk7Course[];
}

export interface Mk7BattleCourse {
  name: string;
  slug: string;
}

export interface Mk7BattleMode {
  id: "balloon" | "coin";
  name: string;
  /** One line on how it's won. */
  line: string;
}

export interface Mk7Game {
  slug: "mario-kart-7";
  name: string;
  assetBase: string;
  checkedOn: string;
  characters: Mk7Character[];
  bodies: Mk7Part[];
  tires: Mk7Part[];
  gliders: Mk7Part[];
  cups: Mk7Cup[];
  battleCourses: Mk7BattleCourse[];
  battleModes: Mk7BattleMode[];
  engines: string[];
}
