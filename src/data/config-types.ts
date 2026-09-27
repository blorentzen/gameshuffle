export type ConfigType = "kart-build" | "track-list" | "player-preset" | "ruleset" | "item-set" | "game-night-setup" | "party-setup";

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
  ruleCardIds: string[];
  /** Mission card ids per seat, same order as `players`. */
  missions: string[][];
}

export type SavedConfigData =
  | KartBuildConfig
  | TrackListConfig
  | PlayerPresetConfig
  | RulesetConfig
  | ItemSetConfig
  | GameNightSetupConfig
  | PartySetupConfig;

export const CONFIG_TYPE_LABELS: Record<ConfigType, string> = {
  "kart-build": "Kart Builds",
  "track-list": "Track Lists",
  "player-preset": "Player Presets",
  "ruleset": "Rulesets",
  "item-set": "Item Sets",
  "game-night-setup": "Game Night Setups",
  "party-setup": "Party Setups",
};
