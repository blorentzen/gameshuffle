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

  activated_at: string | null;
  activated_via: ActivationVia | null;
  ended_at: string | null;
  ended_via: EndedVia | null;

  platforms: SessionPlatforms;
  config: SessionConfig;

  tier_required: "pro" | "pro_plus";
  parent_session_id: string | null;
  feature_flags: SessionFeatureFlags;

  created_at: string;
  updated_at: string;
}
