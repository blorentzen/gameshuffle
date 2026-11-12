/**
 * Types for the Super Mario Kart randomizer. Client-safe, no data.
 */

/** The manual's four classes of driver, two characters each with the same stats. */
export type SmkClass = "bros" | "dragon" | "showdown" | "small";

export interface SmkClassInfo {
  id: SmkClass;
  /** The manual's name ("The Bros."). */
  name: string;
  /** What the pair is good at, in the manual's words ("Standard Performance"). */
  line: string;
}

export interface SmkCharacter {
  /** The game's name ("Princess", "Donkey Kong Jr."). */
  name: string;
  slug: string;
  class: SmkClass;
  /** The tile colour behind the character's picture. */
  color: string;
}

export interface SmkCourse {
  name: string;
  slug: string;
}

export interface SmkCup {
  name: string;
  slug: string;
  courses: SmkCourse[];
}

export interface SmkGame {
  slug: "super-mario-kart";
  name: string;
  assetBase: string;
  checkedOn: string;
  classes: SmkClassInfo[];
  characters: SmkCharacter[];
  cups: SmkCup[];
  battleCourses: SmkCourse[];
  engines: string[];
}
