export type ConfigType = "kart-build" | "track-list" | "player-preset" | "ruleset" | "item-set" | "game-night-setup" | "party-setup" | "smash-setup" | "splatoon-setup" | "kirby-setup" | "stadium-setup" | "sonic-setup" | "wonder-setup" | "double-dash-setup" | "mario-kart-ds-setup" | "mario-kart-7-setup" | "super-mario-kart-setup";

export interface KartBuildConfig {
  type: "kart-build";
  gameSlug: string;
  character: { name: string; img: string };
  vehicle: { name: string; img: string };
  wheels: { name: string; img: string };
  glider: { name: string; img: string };
}

export interface TrackListConfig {
  type: "track-list";
  gameSlug: string;
  tracks: { name: string; img: string; cup?: string }[];
}

export interface PlayerPresetConfig {
  type: "player-preset";
  gameSlug: string;
  players: string[];
}

export interface RulesetConfig {
  type: "ruleset";
  gameSlug: string;
  mode: "casual" | "competitive";
  cc?: string;
  items?: boolean;
  charFilters: string[];
  vehiFilters: string[];
  bannedTrackIds: string[];
}

export interface ItemSetConfig {
  type: "item-set";
  gameSlug: string;
  items: { name: string; img: string }[];
}

export interface GameNightSetupConfig {
  type: "game-night-setup";
  gameSlug: string;
  players: {
    name: string;
    combo: {
      character: { name: string; img: string };
      vehicle: { name: string; img: string };
      wheels: { name: string; img: string };
      glider: { name: string; img: string };
    } | null;
  }[];
  charFilters: string[];
  vehiFilters: string[];
  tracks: { name: string; img: string; cupImg: string }[];
  trackCount: number;
  noDups: boolean;
  tourOnly: boolean;
  activeItems: string[];
}

export interface PartyCardDraw { id: string; seat: number | null; rival: number | null; n: number | null; at?: number | null }

/** A Mario Party night from the party randomizer (shared engine, any MP game). */
export interface PartySetupConfig {
  type: "party-setup";
  gameSlug: string;
  edition: "switch1" | "switch2";
  setup: { boardId: string; rulesetId: string; turns: number; bonusModeId: string } | null;
  players: { name: string; character: string; cpu: boolean }[];
  teams: [number[], number[]] | null;
  boardIds: string[];
  unlockables: boolean;
  gauntlet: string[];
  /** Dealt cards (see CardDraw in src/data/party/cards.ts): id, seat, rival seat, turns. */
  rules: PartyCardDraw[];
  chance: PartyCardDraw[];
  /** Missions per seat, same order as `players`. */
  missions: PartyCardDraw[][];
  /** Card moments the table switched on. */
  moments?: string[];
  /** Hands hidden until each person taps to peek. */
  secret?: boolean;
  /** Turn tracker: the board game's current turn (null before it starts). */
  turn?: number | null;
  /** The rolled night: modes in order. */
  plan?: { modeId: string; option: string | null; minutes: number; turns: number | null }[];
}

/** A Kirby Air Riders session: rider + machine per player, a course, a City Trial Stadium. */
export interface KirbySetupConfig {
  type: "kirby-setup";
  gameSlug: string;
  players: { name: string; rider: string; machine: string }[];
  course: { kind: "air" | "top"; name: string } | null;
  stadium: string | null;
}

/** A Sonic Racing: CrossWorlds session: racer, machine and Gadget Plate per player, plus the races or a Grand Prix. */
export interface SonicSetupConfig {
  type: "sonic-setup";
  gameSlug: string;
  plate: string;
  players: { name: string; racer: string; machine: string; gadgets: string[]; superSlot: string | null }[];
  races: { track: string; crossWorld: string | null }[];
  grandPrix: string | null;
}

/** A Super Mario Bros. Wonder challenge: a character and badge per player, a level (or a run of levels) and the rules. */
export interface WonderSetupConfig {
  type: "wonder-setup";
  gameSlug: string;
  /** The world the levels come from, or null for any world. */
  world: string | null;
  switch2: boolean;
  players: { name: string; character: string; badge: string | null }[];
  level: string | null;
  levels: string[];
  /** Rule ids as rolled ("same-badge" carries its badge). */
  rules: { id: string; badge?: string }[];
}

/**
 * A Mario Kart: Double Dash!! session: a pair and a kart per kart in the room. Each kart lists its people: one (they
 * drive and throw) or two (two to a kart: the first drives, the second throws), then the races or battles rolled.
 */
export interface DoubleDashSetupConfig {
  type: "double-dash-setup";
  gameSlug: string;
  /** Two to a kart, and whether the two swap seats after each race. */
  duo: boolean;
  swap: boolean;
  karts: { people: string[]; driver: string; thrower: string; kart: string }[];
  /** The races rolled: a cup, the All Cup Tour or races, with the engine class. */
  races: { title: string; engine: string | null; courses: string[] } | null;
  battles: { course: string; mode: string }[];
}

/**
 * A Mario Kart DS session: a character and kart per player at the save's kart step, then the races, battles and
 * Mission Mode missions rolled.
 */
export interface MarioKartDsSetupConfig {
  type: "mario-kart-ds-setup";
  gameSlug: string;
  /** Which karts the save has opened: start, own, borrowed or all. */
  level: string;
  racers: { name: string; character: string; kart: string }[];
  /** The races rolled: a cup or races, with the engine class. */
  races: { title: string; engine: string | null; courses: string[] } | null;
  battles: { course: string; mode: string }[];
  /** Missions as "1-4" or "3-boss". */
  missions: string[];
}

/** A Mario Kart 7 session: a character, body, tires and glider per player from the save's parts, races and battles. */
export interface MarioKart7SetupConfig {
  type: "mario-kart-7-setup";
  gameSlug: string;
  /** Which parts the save has: start or all. */
  parts: string;
  racers: { name: string; character: string; body: string; tires: string; glider: string }[];
  races: { title: string; engine: string | null; courses: string[] } | null;
  battles: { course: string; mode: string }[];
}

/** A Super Mario Kart session: a character for each of the two players, races and battle courses. */
export interface SuperMarioKartSetupConfig {
  type: "super-mario-kart-setup";
  gameSlug: string;
  racers: { name: string; character: string }[];
  races: { title: string; engine: string | null; courses: string[] } | null;
  battles: { course: string; mode: string }[];
}

/** A Pokémon Stadium rental session: a cup and a team of 6 rentals per player, with an optional pick of 3. */
export interface StadiumSetupConfig {
  type: "stadium-setup";
  gameSlug: string;
  cup: string;
  round2: boolean;
  players: { name: string; team: string[]; pick: number[] }[];
}

/** A Splatoon session from the Splatoon randomizer: kits, battles, Salmon Run and teams. */
export interface SplatoonSetupConfig {
  type: "splatoon-setup";
  gameSlug: string;
  players: { name: string; weapon: string }[];
  battles: { modeId: string; stage: string }[];
  salmon: string | null;
  teams: { alpha: string[]; bravo: string[] } | null;
}

/** A Smash night from the Smash randomizer. Cards reuse the party card shape. */
export interface SmashSetupConfig {
  type: "smash-setup";
  gameSlug: string;
  players: { name: string; fighter: string; costume: number }[];
  preset: "party" | "competitive";
  stage: { stageId: string; form: "normal" | "battlefield" | "omega"; hazards: boolean } | null;
  rules: { kind: "stock" | "time" | "stamina"; stocks: number | null; minutes: number | null; items: string; finalSmashMeter: boolean } | null;
  custom: Record<string, string> | null;
  squads: string[][];
  plan: { modeId: string; option: string | null; minutes: number; matches: number | null }[];
  rulesCards: PartyCardDraw[];
  chance: PartyCardDraw[];
  missions: PartyCardDraw[][];
  moments?: string[];
  secret?: boolean;
  /** Game counter: which game of the night (null before it starts). */
  turn?: number | null;
}

export type SavedConfigData =
  | StadiumSetupConfig
  | KartBuildConfig
  | TrackListConfig
  | PlayerPresetConfig
  | RulesetConfig
  | ItemSetConfig
  | GameNightSetupConfig
  | PartySetupConfig
  | SmashSetupConfig
  | SplatoonSetupConfig
  | KirbySetupConfig
  | SonicSetupConfig
  | WonderSetupConfig
  | DoubleDashSetupConfig
  | MarioKartDsSetupConfig
  | MarioKart7SetupConfig
  | SuperMarioKartSetupConfig;

export const CONFIG_TYPE_LABELS: Record<ConfigType, string> = {
  "kart-build": "Kart Builds",
  "track-list": "Track Lists",
  "player-preset": "Player Presets",
  "ruleset": "Rulesets",
  "item-set": "Item Sets",
  "game-night-setup": "Game Night Setups",
  "party-setup": "Party Setups",
  "smash-setup": "Smash Setups",
  "splatoon-setup": "Splatoon Setups",
  "kirby-setup": "Kirby Air Riders Setups",
  "stadium-setup": "Pokémon Stadium Teams",
  "sonic-setup": "Sonic Racing: CrossWorlds Setups",
  "wonder-setup": "Super Mario Bros. Wonder Challenges",
  "double-dash-setup": "Mario Kart: Double Dash!! Setups",
  "mario-kart-ds-setup": "Mario Kart DS Setups",
  "mario-kart-7-setup": "Mario Kart 7 Setups",
  "super-mario-kart-setup": "Super Mario Kart Setups",
};
