/**
 * Feature-module type definitions.
 *
 * Per gs-feature-modules-picks-bans.md §2. A module is a self-contained
 * capability that lives inside an integration (Twitch, Discord,
 * cross_platform). The DB table `session_modules` stores per-session
 * config + runtime state as jsonb; the shapes are declared here per
 * module ID.
 */

import type { SubscriptionTier } from "@/lib/subscription";

export type ModuleIntegration = "twitch" | "discord" | "cross_platform";

export type ModuleId =
  | "kart_randomizer"  // existing — retrofitted as a module per §3
  | "picks"            // §4
  | "bans"             // §5
  | "race_randomizer"; // Phase A — race-level track + item randomization

export interface ModuleDefinition<TConfig = Record<string, unknown>> {
  /** Stable identifier — references session_modules.module_id. */
  id: ModuleId;
  /** Streamer-facing display name. */
  displayName: string;
  /** One-line value prop for the Modules section UI. */
  description: string;
  /** Which integration this module belongs to. */
  integration: ModuleIntegration;
  /** Minimum subscription tier required to enable this module. */
  requiredTier: SubscriptionTier;
  /** Per-session default config, applied when the module is first enabled. */
  defaultConfig: TConfig;
  /** Twitch chat command names this module owns (without `!gs-` prefix). */
  chatCommands?: string[];
  /** Overlay element IDs this module renders (used by overlay router). */
  overlayElements?: string[];
}

// ---------- Picks module ----------

export type PickableCategory = "characters" | "karts" | "wheels" | "gliders" | "tracks";

export interface PicksConfig {
  picks_per_participant: number;
  pickable_categories: PickableCategory[];
  category_pick_limits?: Partial<Record<PickableCategory, number>>;
  timer_seconds: number;
  confirm_mode: "auto" | "manual" | "manual_with_timeout";
  allow_pick_changes: boolean;
}

export type PicksStatus = "collecting" | "locked" | "completed";

export interface PicksState {
  status: PicksStatus;
  /** participant twitch_user_id → category → array of picked items. */
  picks_by_participant: Record<string, Partial<Record<PickableCategory, string[]>>>;
  timer_started_at: string | null;
  locked_at: string | null;
}

// ---------- Bans module ----------

export type BannableCategory = PickableCategory;

export interface BansConfig {
  bans_per_participant: number;
  bannable_categories: BannableCategory[];
  category_ban_limits?: Partial<Record<BannableCategory, number>>;
  timer_seconds: number;
  confirm_mode: "auto" | "manual" | "manual_with_timeout";
  allow_ban_changes: boolean;
}

export type BansStatus = "collecting" | "locked" | "completed";

export interface BansState {
  status: BansStatus;
  /** participant twitch_user_id → category → array of banned items. */
  bans_by_participant: Record<string, Partial<Record<BannableCategory, string[]>>>;
  timer_started_at: string | null;
  locked_at: string | null;
}

// ---------- Kart Randomizer module ----------

/**
 * Kart Randomizer config is intentionally minimal — the existing per-game
 * registry (TWITCH_GAMES) and per-streamer Twitch settings handle the
 * heavy lifting today. Module wrapper exists so future config (e.g.
 * filter sets, drift restriction, character allowlist) can land here
 * without restructuring.
 */
export interface KartRandomizerConfig {
  /** Per-user shuffle cooldown in seconds. Default 30 per existing constant. */
  cooldown_seconds: number;
}

export interface KartRandomizerState {
  /** Reserved — kart shuffle state lives in session_participants today. */
  _reserved?: never;
}

// ---------- Race Randomizer module (Phase A) ----------

/**
 * Race-level randomization: one track per race, one item rule set per
 * race, applied to the whole session room. Distinct from per-viewer
 * kart randomization in scope and ownership — picks/bans operate at the
 * individual-track / individual-preset level (matching kart culture).
 *
 * Per gs-track-item-randomization-phase-a-spec.md §§2.1, 4.1.
 */
export interface RaceRandomizerSubConfig {
  /** Whether this sub-pool participates in randomization at all. */
  enabled: boolean;
  /** IDs of tracks/presets explicitly picked (forced inclusion). When
   *  non-empty, the randomization pool is restricted to these IDs. */
  picks: string[];
  /** IDs of tracks/presets explicitly banned. Excluded from the pool. */
  bans: string[];
  /** Where picks/bans come from for this pool:
   *  - 'streamer' (default): streamer pre-curates the picks/bans list
   *    via the tile editor. Viewers play whatever the streamer set.
   *  - 'viewers': picks/bans come from viewer ballots in a picks/bans
   *    round. Streamer opens a round, viewers vote, streamer applies
   *    the top-N back into this pool. The tile editor is hidden in
   *    this mode (use the Picks & Bans round panel instead). */
  source?: "streamer" | "viewers";
}

/**
 * Items config — split into modes (rule sets) and literal items
 * (individual items in the box). Streamers can ban Blue Shells without
 * banning every mode that includes them, and run "Custom" mode to draw
 * from a hand-picked literal pool.
 */
export interface RaceRandomizerItemsConfig {
  /** Mode pool — `!gs-items` rolls from here. */
  modes: RaceRandomizerSubConfig;
  /** Literal item picks/bans pool. Reserved as a global filter slot
   *  for the future (e.g. "ban Blue Shells across every mode"). Not
   *  currently applied to mode rolls since each themed mode now
   *  carries its own item list — see `MK8DX_ITEM_MODES`. */
  literal: RaceRandomizerSubConfig;
}

export interface RaceRandomizerConfig {
  /** Master toggle for the module. When false, all `!gs-track` /
   *  `!gs-items` / `!gs-race` commands are disabled. */
  enabled: boolean;
  tracks: RaceRandomizerSubConfig;
  /** MKWorld-only: knockout rallies pool. Picks/bans operate
   *  independently of regular tracks. When the streamer rolls a rally
   *  (via `!gs-rally` or by setting `rollKind` to `rally`/`auto` for
   *  `!gs-race`), GS draws from this sub-pool instead of `tracks`. */
  rallies?: RaceRandomizerSubConfig;
  /** What `!gs-race` rolls when invoked without disambiguation:
   *  - `'race'` (default): roll a race track only
   *  - `'rally'`: roll a knockout rally only
   *  - `'auto'`: pick whichever the active game supports — MKWorld
   *    randomly picks between race and rally per roll
   *  Streamers can still call `!gs-rally` directly to force a rally
   *  regardless of this setting. */
  rollKind?: "race" | "rally" | "auto";
  /** Items config — see `RaceRandomizerItemsConfig`. Legacy single
   *  sub-pool shape (just `RaceRandomizerSubConfig`) is auto-wrapped
   *  into `{ modes: <legacy>, literal: empty }` on first read by the
   *  store helpers + the SQL migration. */
  items: RaceRandomizerItemsConfig | RaceRandomizerSubConfig;
  /** Default series length for `!gs-track` / `!gs-race` when invoked
   *  without an explicit count. Streamers running fixed-length
   *  competitive series (e.g. always 4 races, always 8) configure this
   *  once and skip typing the number every time. Falls back to 1 when
   *  unset. Explicit args (`!gs-race 8`) still override. */
  defaultSeriesLength?: number;
  /** When true, a race series allows the same track to roll more than
   *  once. Default false — competitive series typically dedupe so every
   *  race is a different track. */
  allowSeriesDuplicates?: boolean;
  /** Streamer-set lobby room code for the current session. Surfaced
   *  to viewers via `!gs room` / `!room`. Null when not set; the chat
   *  command tells the asker the streamer hasn't shared one yet. */
  roomCode?: string | null;
  /** Where viewers actually get the room code:
   *  - `'twitch_chat'` (default): bot replies in chat with the code.
   *  - `'discord'`: bot redirects asker to the streamer's Discord
   *    invite URL (`users.socials.discord_invite`) AND posts the
   *    code into the streamer's configured Discord notify channel
   *    whenever it changes. Falls back to chat reply when Discord
   *    isn't wired up. */
  roomCodeShareMode?: "twitch_chat" | "discord";
  /** Platforms this streamer plays this game on. Drives the `!gs fc`
   *  command — the chat handler reads the streamer's `users.gamertags`
   *  for each platform listed here and shares them. MK8DX/MKW are
   *  Nintendo-only so the templates default to `["nso"]`; multi-
   *  platform games let the streamer pick more. */
  platforms?: GamertagPlatformKey[];
  /** Where viewers get the friend code(s) — mirrors `roomCodeShareMode`
   *  for the `!gs fc` command.
   *  - `'twitch_chat'` (default): bot posts the streamer's friend
   *    codes for the active game's platforms in chat.
   *  - `'discord'`: bot redirects askers to the streamer's Discord
   *    invite (where their FCs live pinned). Falls back to chat
   *    post when no invite URL is set. */
  fcShareMode?: "twitch_chat" | "discord";
}

/** Keys matching `Gamertags` in `src/data/gamertag-types.ts`. */
export type GamertagPlatformKey =
  | "nso"
  | "psn"
  | "xbox"
  | "steam"
  | "epic";

/**
 * Type guard for the new wrapped items shape vs the legacy single-pool
 * shape. Use this everywhere `RaceRandomizerConfig.items` is read so
 * legacy rows keep working until the migration runs.
 */
export function isWrappedItemsConfig(
  items: RaceRandomizerConfig["items"]
): items is RaceRandomizerItemsConfig {
  return (
    typeof items === "object" &&
    items !== null &&
    "modes" in items &&
    "literal" in items
  );
}

/**
 * Returns the modes sub-config from either the new or legacy shape.
 * Legacy `items: RaceRandomizerSubConfig` is treated as the modes pool
 * (preserves prior behavior).
 */
export function getItemModesConfig(
  items: RaceRandomizerConfig["items"]
): RaceRandomizerSubConfig {
  return isWrappedItemsConfig(items) ? items.modes : items;
}

/**
 * Returns the literal items sub-config. Legacy shape has no literal
 * pool; we return an empty enabled-by-default sub-config so the
 * "Custom" mode degrades gracefully.
 */
export function getLiteralItemsConfig(
  items: RaceRandomizerConfig["items"]
): RaceRandomizerSubConfig {
  if (isWrappedItemsConfig(items)) return items.literal;
  return { enabled: true, picks: [], bans: [] };
}

export interface RaceRandomizerState {
  /** Last track randomized in this session, or null if none yet. */
  last_track_id: string | null;
  /** Last item preset randomized in this session, or null. */
  last_item_preset_id: string | null;
  /** ISO timestamp of the most recent track/items/race randomization. */
  last_randomized_at: string | null;
}

// ---------- Type narrowing helpers ----------

export type ConfigForModule<Id extends ModuleId> = Id extends "picks"
  ? PicksConfig
  : Id extends "bans"
    ? BansConfig
    : Id extends "kart_randomizer"
      ? KartRandomizerConfig
      : Id extends "race_randomizer"
        ? RaceRandomizerConfig
        : never;

export type StateForModule<Id extends ModuleId> = Id extends "picks"
  ? PicksState
  : Id extends "bans"
    ? BansState
    : Id extends "kart_randomizer"
      ? KartRandomizerState
      : Id extends "race_randomizer"
        ? RaceRandomizerState
        : never;
