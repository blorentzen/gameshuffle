/**
 * Perfect Dark Combat Simulator data types (N64, on Nintendo Switch Online +
 * Expansion Pack). Mirrors the GoldenEye randomizer's shape, plus simulants.
 * Client-safe.
 */

export type PdAvailability = "start" | "unlock";

export interface PdArena { id: string; name: string; available: PdAvailability; unlock: string | null; goldeneyeClassic: boolean }
export interface PdScenario { id: string; name: string; blurb: string; teams: "required" | "optional" | "none"; minPlayers: number; available: PdAvailability }
export interface PdWeaponSet { id: string; name: string; weapons: string[]; available: PdAvailability }
export interface PdSimType { name: string; behavior: string; available: PdAvailability }
export interface PdCharacter { name: string; group: "main" | "additional"; available: PdAvailability }
export interface PdOption { name: string; available: PdAvailability }

export interface PdData {
  arenas: PdArena[];
  scenarios: PdScenario[];
  weaponSets: PdWeaponSet[];
  simulants: {
    difficulties: string[];
    /** Difficulties open on a new save (Hard, Perfect and Dark come with challenges). */
    freshDifficulties: string[];
    specialTypes: PdSimType[];
    maxSimulants: number;
    /** 4 until 7 challenges are done. */
    maxSimulantsFreshSave: number;
    maxPlayersPlusSims: number;
  };
  characters: PdCharacter[];
  limits: { time: string[]; score: string[] };
  options: PdOption[];
}

export interface PdOptions {
  players: number;
  /** Only what's open on a new save. */
  freshSave: boolean;
  allowTeams: boolean;
  /** How many simulants to add (0 to fill). */
  sims: number;
  /** Difficulties the simulants can roll. Empty = all. */
  simDifficulties: string[];
  /** Let simulants roll special types (KazeSim, FistSim…). */
  simSpecials: boolean;
  /** Add one random Combat Simulator option (One-Hit Kills, Slow Motion…). */
  chaos: boolean;
  /** Characters to draw from: Joanna and the named cast, or the guards and staff. */
  cast: "main" | "additional";
}

export interface PdSim { difficulty: string; type: string | null }

export interface PdMatch {
  scenario: PdScenario;
  arena: PdArena;
  weaponSet: PdWeaponSet;
  limit: string;
  sims: PdSim[];
  option: string | null;
  /** Team per player (scenarios that need teams), then per simulant. */
  teams: { players: number[]; sims: number[] } | null;
}
