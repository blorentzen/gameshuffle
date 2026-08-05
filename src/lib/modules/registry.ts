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
  DiceConfig,
  CoinConfig,
  OracleConfig,
  NamePickerConfig,
  TimerConfig,
  BingoConfig,
  TierListConfig,
} from "./types";

/** Standard tier rows (tiermaker-style colors). */
export const DEFAULT_TIERS: { key: string; label: string; color: string }[] = [
  { key: "S", label: "S", color: "#ff7f7f" },
  { key: "A", label: "A", color: "#ffbf7f" },
  { key: "B", label: "B", color: "#ffdf7f" },
  { key: "C", label: "C", color: "#bfff7f" },
  { key: "D", label: "D", color: "#7fbfff" },
];

/**
 * Default community-bingo prompt pool — generic "things that happen on a gaming
 * stream" so the tool works out of the box. Streamers can replace these with
 * their own pool in the Stream Tools tab.
 */
export const DEFAULT_BINGO_PROMPTS: string[] = [
  "Streamer rages",
  "Chat spams the emote",
  "\"One more game\"",
  "Falls off the map",
  "Blames lag",
  "Clutch win",
  "Reads a donation",
  "Forgets to unmute",
  "Technical difficulties",
  "Backseat gaming",
  "First place",
  "Last place",
  "Blue shell",
  "Rematch demanded",
  "Snack break",
  "Water break",
  "New follower alert",
  "Raid incoming",
  "Streamer laughs uncontrollably",
  "Chat backseat is right",
  "\"That was so lucky\"",
  "Rage quit threatened",
  "Comeback victory",
  "Mic peaks",
  "Dog/cat appears",
  "Wrong button pressed",
  "\"I'm cracked today\"",
  "Perfect run ruined",
  "Chat picks the next game",
  "Streamer misses an easy shot",
];

export const DEFAULT_DICE_CONFIG: DiceConfig = {
  dieColor: "#eef1f6",
  pipColor: "#1b2740",
  defaultCount: 2,
};

export const DEFAULT_TIMER_CONFIG: TimerConfig = {
  accentColor: "#2f6fd6",
  defaultSeconds: 300, // 5 minutes
};

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
    items: {
      modes: { enabled: true, picks: [], bans: [] },
      literal: { enabled: true, picks: [], bans: [] },
    },
  },
  chatCommands: [
    "track",
    "items",
    "race",
    // MKWorld-only knockout rallies. Routes through the same dispatcher
    // case but force-fires a rally regardless of the rollKind preference.
    "rally",
    // Picks/bans chat commands moved to broadcaster signals only —
    // viewer picks/bans live in the live view per multi-game spec PR B.
    "picks-open",
    "picks-close",
  ],
  overlayElements: ["race-card"],
};

const DICE: ModuleDefinition<DiceConfig> = {
  id: "dice",
  displayName: "Dice Roller",
  description: "Roll dice on your overlay from chat, the Hub, or a channel-point reward. Your colors.",
  integration: "twitch",
  requiredTier: "pro",
  defaultConfig: DEFAULT_DICE_CONFIG,
  chatCommands: ["gs-dice"],
  overlayElements: ["dice"],
};

const COIN: ModuleDefinition<CoinConfig> = {
  id: "coin",
  displayName: "Coin Flip",
  description: "Flip a coin on your overlay from chat, the Hub, or a channel-point reward.",
  integration: "twitch",
  requiredTier: "pro",
  defaultConfig: { style: "gold" },
  chatCommands: ["gs-flip"],
  overlayElements: ["coin"],
};

const ORACLE: ModuleDefinition<OracleConfig> = {
  id: "oracle",
  displayName: "Oracle (8-Ball / Yes-No / Truth or Dare)",
  description: "Viewers ask the 8-Ball, settle a yes/no, or pull truth-or-dare — answers pop on your overlay.",
  integration: "twitch",
  requiredTier: "pro",
  defaultConfig: {
    truthDareSet: "party",
    allowMaybe: true,
    eightBallMode: "standard",
    customEightBall: [],
    truthDareMode: "standard",
    customTruths: [],
    customDares: [],
  },
  chatCommands: ["gs-8ball", "gs-decide", "gs-truth", "gs-dare"],
  overlayElements: ["oracle"],
};

const NAME_PICKER: ModuleDefinition<NamePickerConfig> = {
  id: "name_picker",
  displayName: "Name Picker (Raffle)",
  description: "Viewers type !enter to join; you !draw a winner. The reveal animates on your overlay.",
  integration: "twitch",
  requiredTier: "pro",
  defaultConfig: {
    defaultWinners: 1,
    removeWinners: false,
  },
  chatCommands: ["gs-enter", "gs-draw"],
  overlayElements: ["name_picker"],
};

const TIMER: ModuleDefinition<TimerConfig> = {
  id: "timer",
  displayName: "Stream Timer",
  description: "Start a countdown on your overlay from chat or the Hub — breaks, speedrun splits, giveaway windows.",
  integration: "twitch",
  requiredTier: "pro",
  defaultConfig: DEFAULT_TIMER_CONFIG,
  chatCommands: ["gs-timer"],
  overlayElements: ["timer"],
};

const BINGO: ModuleDefinition<BingoConfig> = {
  id: "bingo",
  displayName: "Community Bingo",
  description: "A shared bingo card of stream moments — mark squares from chat or the Hub, celebrate a line on the overlay.",
  integration: "twitch",
  requiredTier: "pro",
  defaultConfig: {
    prompts: [],
    accentColor: "#7c3aed",
    size: 5,
    freeCenter: true,
  },
  chatCommands: ["gs-bingo"],
  overlayElements: ["bingo"],
};

const TIERLIST: ModuleDefinition<TierListConfig> = {
  id: "tierlist",
  displayName: "Tier List",
  description: "Rank anything S-through-D live on your overlay — games, characters, chat suggestions — placed from the Hub.",
  integration: "twitch",
  requiredTier: "pro",
  defaultConfig: {
    items: [],
    accentColor: "#2f6fd6",
    title: "Tier List",
  },
  chatCommands: ["gs-tier"],
  overlayElements: ["tierlist"],
};

export const MODULE_REGISTRY: Record<ModuleId, ModuleDefinition<unknown>> = {
  kart_randomizer: KART_RANDOMIZER as ModuleDefinition<unknown>,
  picks: PICKS as ModuleDefinition<unknown>,
  bans: BANS as ModuleDefinition<unknown>,
  race_randomizer: RACE_RANDOMIZER as ModuleDefinition<unknown>,
  dice: DICE as ModuleDefinition<unknown>,
  coin: COIN as ModuleDefinition<unknown>,
  oracle: ORACLE as ModuleDefinition<unknown>,
  name_picker: NAME_PICKER as ModuleDefinition<unknown>,
  timer: TIMER as ModuleDefinition<unknown>,
  bingo: BINGO as ModuleDefinition<unknown>,
  tierlist: TIERLIST as ModuleDefinition<unknown>,
};

/** All module IDs in declaration order — useful for UI rendering / iteration. */
export const ALL_MODULE_IDS: ModuleId[] = [
  "kart_randomizer",
  "picks",
  "bans",
  "race_randomizer",
  "dice",
  "coin",
  "oracle",
  "name_picker",
  "timer",
  "bingo",
  "tierlist",
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
