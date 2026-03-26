export interface Character {
  name: string;
  img: string;
  weight?: string; // "Light" | "Medium" | "Heavy" — MK8DX only
}

export interface Vehicle {
  name: string;
  img: string;
  drift?: string; // "Inward" | "Outward" — MK8DX only
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
}

export interface Cup {
  img: string;
  courses: Course[];
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
  hasTrackTypeFilter: boolean;
}
