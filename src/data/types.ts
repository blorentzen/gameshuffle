export interface Character {
  name: string;
  img: string;
  weight?: string; // "Light" | "Medium" | "Heavy" — MK8DX only
}

export interface Vehicle {
  name: string;
  img: string;
  drift?: string; // "Inward" | "Outward" (MK8DX); "Inside" | "Outside" on Mario Kart Wii's bikes
  type?: string;  // "Kart" | "Bike" | "ATV" (MKWorld, Mario Kart Wii)
  /** Mario Kart Wii: the size class it belongs to ("Small" | "Medium" | "Large"); only drivers of that size can take it. */
  size?: string;
  /** What the vehicle filter matches when set (Mario Kart Wii: "Kart" | "Outside-drift bike" | "Inside-drift bike"); else `drift`. */
  kind?: string;
}

export interface Wheel {
  name: string;
  img: string;
}

export interface Glider {
  name: string;
  img: string;
}

export interface Course {
  name: string;
  img: string;
  type?: string; // "Tour" | "Standard" — MK8DX only
  icon?: string; // overworld icon — MKWorld
  /** A short line under the name ("7 laps", "Shine Thief"), when the race needs one. */
  note?: string;
}

export interface Cup {
  name?: string;
  img: string;
  courses: Course[];
}

export interface KnockoutRally {
  name: string;
  img: string;
}

export interface Item {
  name: string;
  img: string;
  category: "offensive" | "defensive" | "boost" | "special";
  rarity: "common" | "uncommon" | "rare";
}

export interface GameData {
  characters: Character[];
  vehicles: Vehicle[];
  wheels?: Wheel[];
  gliders?: Glider[];
  cups?: Cup[];
  items?: Item[];
  knockoutRallies?: KnockoutRally[];
  /** Battle courses (Mario Kart 64), rolled in the same tab as knockout rallies. */
  battleCourses?: KnockoutRally[];
}

export interface KartCombo {
  character: Character;
  vehicle: Vehicle;
  wheels: Wheel;
  glider: Glider;
}

export interface Player {
  id: string;
  name: string;
  combo: KartCombo | null;
}

export interface SelectedTrack {
  raceNumber: number;
  course: Course;
  cupImg: string;
}

export interface GameConfig {
  slug: string;
  title: string;
  maxPlayers: number;
  hasWeightFilter: boolean;
  hasDriftFilter: boolean;
  hasVehicleTypeFilter?: boolean; // "Kart" | "Bike" | "ATV" — MKWorld
  hasTrackTypeFilter: boolean;
  hasKnockoutRallies?: boolean;
  showCupIcons?: boolean;
  raceCounts?: number[];
  /** No "what you have" bar: nothing to collect or unlock (Mario Kart 64). */
  noCollection?: boolean;
  /** Beta label on the hero and a Beta banner (new randomizers whose art isn't in yet). */
  isNew?: boolean;
  /** Every player gets a different character (Mario Kart 64 doesn't allow repeats). */
  uniqueCharacters?: boolean;
  /** The character filter's choices when they aren't Light / Medium / Heavy (Mario Kart Wii's size classes). */
  weightFilter?: { label: string; options: { value: string; label: string }[] };
  /** The vehicle filter's choices when they aren't MK8DX's drift types (Mario Kart Wii: karts and the two kinds of bike). */
  vehicleFilter?: { label: string; options: { value: string; label: string }[] };
  /** A line under the vehicle saying what it is ("Bike · Inside drift"), for games where that decides how it handles. */
  vehicleNote?: boolean;
  /** The second race mode's wording when it isn't Knockout Rally (Mario Kart 64 battle courses). */
  altMode?: { tab: string; heading: string; body: string; button: string; counterLabel: string; /** Tile label, e.g. "Battle" (default "Race"). */ unit?: string };
}
