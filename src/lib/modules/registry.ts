/**
 * Module registry — central declaration of all available feature modules.
 *
 * Every module added to GameShuffle gets an entry here with its metadata,
 * default config, and chat-command/overlay-element ownership. The chat
 * dispatcher and overlay router both read from this registry to know
 * which module owns what.
 *
 * Per gs-feature-modules-picks-bans.md §2.
 */

import type {
  ModuleDefinition,
  ModuleId,
  PicksConfig,
  BansConfig,
  KartRandomizerConfig,
  RaceRandomizerConfig,
} from "./types";

const KART_RANDOMIZER: ModuleDefinition<KartRandomizerConfig> = {
  id: "kart_randomizer",
  displayName: "Kart Randomizer",
  description: "Random kart loadouts (character + vehicle + wheels + glider) per player on demand.",
  integration: "twitch",
  requiredTier: "pro",
  defaultConfig: {
    cooldown_seconds: 30,
  },
  chatCommands: ["shuffle", "mycombo"],
  overlayElements: ["combo-card"],
};

const PICKS: ModuleDefinition<PicksConfig> = {
  id: "picks",
  displayName: "Picks",
  description: "Each participant locks in their own picks (characters, karts, tracks) via chat.",
  integration: "twitch",
  requiredTier: "pro",
  defaultConfig: {
    picks_per_participant: 2,
    pickable_categories: ["characters"],
    timer_seconds: 90,
    confirm_mode: "manual_with_timeout",
    allow_pick_changes: true,
  },
  chatCommands: ["pick", "picks", "pickreset"],
  overlayElements: ["picks-display", "picks-timer"],
};

const BANS: ModuleDefinition<BansConfig> = {
  id: "bans",
  displayName: "Bans",
  description: "Participants ban items from the pool before picks (or for the whole session).",
  integration: "twitch",
  requiredTier: "pro",
  defaultConfig: {
    bans_per_participant: 1,
    bannable_categories: ["characters"],
    timer_seconds: 60,
    confirm_mode: "manual_with_timeout",
    allow_ban_changes: true,
  },
  chatCommands: ["ban", "bans", "banreset"],
  overlayElements: ["bans-display", "bans-timer"],
};

/**
 * Race randomizer (Phase A) — race-level track + item rule randomization.
 * Distinct from kart randomization (per-viewer) and picks/bans
 * (deliberation phase). Default config: enabled module with both pools
 * fully open and no picks/bans applied.
 */
const RACE_RANDOMIZER: ModuleDefinition<RaceRandomizerConfig> = {
  id: "race_randomizer",
  displayName: "Race Randomizer",
  description:
    "Roll a track + item rule set for the room — picks/bans operate at the individual track and individual preset level.",
  integration: "twitch",
  requiredTier: "pro",
  defaultConfig: {
    enabled: true,
    tracks: { enabled: true, picks: [], bans: [] },
    items: { enabled: true, picks: [], bans: [] },
  },
  chatCommands: [
    "track",
    "items",
    "race",
    "pick-track",
    "ban-track",
    "pick-item",
    "ban-item",
    "clear-track-bans",
    "clear-item-bans",
  ],
  overlayElements: ["race-card"],
};

export const MODULE_REGISTRY: Record<ModuleId, ModuleDefinition<unknown>> = {
  kart_randomizer: KART_RANDOMIZER as ModuleDefinition<unknown>,
  picks: PICKS as ModuleDefinition<unknown>,
  bans: BANS as ModuleDefinition<unknown>,
  race_randomizer: RACE_RANDOMIZER as ModuleDefinition<unknown>,
};

/** All module IDs in declaration order — useful for UI rendering / iteration. */
export const ALL_MODULE_IDS: ModuleId[] = [
  "kart_randomizer",
  "picks",
  "bans",
  "race_randomizer",
];

/**
 * Resolve a chat command name (e.g. "pick", "shuffle") to its owning module.
 * Returns null when the command isn't claimed by any module — the caller
 * decides whether to dispatch as a built-in (help, etc.) or ignore.
 */
export function moduleForChatCommand(commandName: string): ModuleId | null {
  for (const id of ALL_MODULE_IDS) {
    const def = MODULE_REGISTRY[id];
    if (def.chatCommands?.includes(commandName)) return id;
  }
  return null;
}

/** Type-narrowed accessor when the caller knows the module ID at compile time. */
export function getModule<Id extends ModuleId>(id: Id): ModuleDefinition<unknown> {
  return MODULE_REGISTRY[id];
}
