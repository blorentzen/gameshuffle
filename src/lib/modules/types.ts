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
  | "bans";            // §5

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

// ---------- Type narrowing helpers ----------

export type ConfigForModule<Id extends ModuleId> = Id extends "picks"
  ? PicksConfig
  : Id extends "bans"
    ? BansConfig
    : Id extends "kart_randomizer"
      ? KartRandomizerConfig
      : never;

export type StateForModule<Id extends ModuleId> = Id extends "picks"
  ? PicksState
  : Id extends "bans"
    ? BansState
    : Id extends "kart_randomizer"
      ? KartRandomizerState
      : never;
