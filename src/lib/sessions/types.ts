/**
 * Session domain types — the shapes used across the platform-agnostic
 * session service. Mirrors the architecture doc §4 schema.
 */

export type SessionStatus =
  | "draft"
  | "scheduled"
  | "ready"
  | "active"
  | "ending"
  | "ended"
  | "cancelled";

/** Title-cased display label for a session status. Use everywhere a
 *  status appears in the UI (badge, copy, headers) so the user-facing
 *  text stays consistent — no mixed casing across surfaces. */
export function statusLabel(status: SessionStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "scheduled":
      return "Scheduled";
    case "ready":
      return "Ready";
    case "active":
      return "Active";
    case "ending":
      return "Ending";
    case "ended":
      return "Ended";
    case "cancelled":
      return "Cancelled";
  }
}

export type ActivationVia = "manual" | "auto_prompt" | "chat_command" | "scheduled_auto";
export type EndedVia = "manual" | "stream_ended_grace" | "auto_timeout" | "system";

export type ActorType = "streamer" | "mod" | "viewer" | "system";

export interface SessionStreamingPlatform {
  type: "twitch" | "kick" | "youtube";
  channel_id?: string;
  channel_name?: string;
  category_id?: string;
}

export interface SessionDiscordPlatform {
  server_id: string;
  server_name?: string;
  channel_id?: string;
}

export interface SessionPlatforms {
  streaming?: SessionStreamingPlatform;
  discord?: SessionDiscordPlatform;
}

export interface SessionConfig {
  game?: string;
  max_participants?: number;
  modules?: string[];
  module_config?: Record<string, unknown>;
  /** Optional CDN URL for a streamer-uploaded event-specific image used
   *  as the session header thumbnail. Falls back to the streamer's
   *  avatar when absent. Upload UI is deferred to the future Empac CDN
   *  avatar/header upload work. */
  custom_event_image_url?: string;
  /** Queue (GS Queue) per-session config. Lives under config so it can
   *  evolve without DDL. cap is the lobby ceiling; rotation defines how
   *  GS pulls names. */
  queue?: {
    cap?: number;
    rotation?: "fifo" | "random";
  };
  [key: string]: unknown;
}

export interface SessionFeatureFlags {
  test_session?: boolean;
  [key: string]: unknown;
}

export interface GsSession {
  id: string;
  owner_user_id: string;

  name: string;
  slug: string;
  description: string | null;

  status: SessionStatus;

  scheduled_at: string | null;
  scheduled_eligibility_window_hours: number;
  /** Spec 02 §5 — scheduled-→-open policy. When `scheduled_at` lands
   *  in the past AND this is set, the lifecycle sweep
   *  (`sweepScheduledOpens`) takes action:
   *    - `auto_open`     — transition `scheduled → active` AND
   *                        publish `session_opened` for fan-out.
   *    - `announce_only` — leave status `scheduled`, publish
   *                        `session_announced`; streamer opens
   *                        manually afterwards.
   *  `null` (default) preserves the legacy `scheduled → ready`
   *  eligibility-window path with no announcement.
   *  Per Spec 02 §7 the field ships with the publisher behavior
   *  baked in from the start — hard to retrofit.
   */
  open_mode: "announce_only" | "auto_open" | null;

  activated_at: string | null;
  activated_via: ActivationVia | null;
  ended_at: string | null;
  ended_via: EndedVia | null;

  platforms: SessionPlatforms;
  config: SessionConfig;

  /** Streamer-declared list of games this session plans to host, in
   *  expected play order. Index 0 is the default active game for test
   *  sessions when no Twitch category is firing. Empty array means
   *  queue-only (no game pre-declared). */
  configured_games: string[];

  /** Currently-active game, driven by Twitch's category. NULL means the
   *  queue fallback is engaged (stream offline, unsupported category, or
   *  pre-active session state). Never set by the streamer directly —
   *  the platform is the source of truth. */
  active_game: string | null;

  tier_required: "pro" | "pro_plus";
  parent_session_id: string | null;
  feature_flags: SessionFeatureFlags;

  // Phase 2 — lifecycle automation columns. All nullable; populated by
  // webhook handlers + cron sweeps.
  stream_offline_at: string | null;
  grace_period_expires_at: string | null;
  /** JSONB tracking which 1h/24h/7d notifications have fired. */
  inactive_notified_at: Record<string, string>;
  /** Set at activation; cron checks for 12h auto-timeout. */
  auto_timeout_at: string | null;

  created_at: string;
  updated_at: string;
}
