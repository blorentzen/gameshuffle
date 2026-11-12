/**
 * Types for the Mario Kart DS randomizer. Client-safe, no data.
 */

/** Weight classes, as the game's tables give them. */
export type DsClass = "Light" | "Medium" | "Heavy";

/**
 * How far a save has got, which decides the karts each character can take (the game's own steps):
 *   start     a new save: each character's signature kart and standard kart (2 each)
 *   own       gold in every 100cc Nitro cup: each character's second signature kart too (3 each)
 *   borrowed  gold in every 150cc Nitro cup or every 150cc Retro cup: four other characters' signature karts too (7 each)
 *   all       gold in all eight Mirror cups: any character in any of the 36 karts
 */
export type DsKartLevel = "start" | "own" | "borrowed" | "all";

export interface DsCharacter {
  /** The select screen's name ("Donkey Kong", "R.O.B."). */
  name: string;
  /** File name under the game's art folder (characters/<slug>.webp). */
  slug: string;
  weight: DsClass;
  /** How it's unlocked; the eight without one are there from the start. */
  unlock?: string;
  /** The four other characters' signature karts it can take once the 150cc cups are won, as the game lists them. */
  borrows: [string, string, string, string];
  /** The tile colour behind the character's picture. */
  color: string;
}

/** signature = the character's kart from the start; standard = their standard kart; second = the signature kart that
 *  unlocks with gold in every 100cc Nitro cup. */
export type DsKartKind = "signature" | "standard" | "second";

export interface DsKart {
  name: string;
  slug: string;
  /** The character it belongs to. */
  owner: string;
  kind: DsKartKind;
}

export interface DsCourse {
  /** The game's name: retro courses carry their console ("SNES Choco Island 2"). */
  name: string;
  slug: string;
  /** Laps in a race: 3, but GCN Baby Park has 5. */
  laps: number;
}

export interface DsCup {
  name: string;
  slug: string;
  /** Nitro = the game's own courses, Retro = courses from the earlier games. */
  kind: "nitro" | "retro";
  courses: DsCourse[];
}

export interface DsBattleCourse {
  /** No console in front, even for the retro ones (Block Fort, Pipe Plaza), as in the game. */
  name: string;
  slug: string;
}

export interface DsBattleMode {
  id: "balloon" | "shine";
  name: string;
  /** One line on how it's won. */
  line: string;
}

export interface DsMission {
  /** 1 to 7. */
  level: number;
  /** 1 to 8, or 9 for the level's boss. */
  number: number;
  /** The in-game mission text. */
  text: string;
  /** Where it's played: a race or battle course by our name, or null for a boss arena. */
  course: string | null;
  /** The course is driven the other way. */
  reverse?: boolean;
  /** The character the game gives you. */
  character: string;
  /** The time limit ("0:35"), or null when it's a race to the finish. */
  time: string | null;
  /** A boss mission's boss. */
  boss?: string;
}

export interface DsGame {
  slug: "mario-kart-ds";
  name: string;
  /** Where the art lives (`${assetBase}characters/mario.webp`). */
  assetBase: string;
  checkedOn: string;
  characters: DsCharacter[];
  karts: DsKart[];
  cups: DsCup[];
  battleCourses: DsBattleCourse[];
  battleModes: DsBattleMode[];
  engines: string[];
  missions: DsMission[];
  /** Mission Mode bosses with a picture (bosses/<slug>.webp). */
  bosses: { name: string; slug: string }[];
}
