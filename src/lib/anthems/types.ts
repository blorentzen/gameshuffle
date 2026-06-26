/**
 * Walk-Up Anthems — domain types.
 *
 * An "anthem" is a personal, MLB-style walk-up song: a short (10–15s) clip of
 * a stream-safe track that plays on a streamer's OBS overlay when an eligible
 * viewer shows up (default trigger: first chat of the stream).
 *
 * The anthem is personal to the *user* (part of their profile/personalization
 * layer, travels across channels). The *streamer* owns channel policy — see
 * ChannelAnthemPolicy. Catalog is provider-fed + source-agnostic; see
 * ./providers for the MusicProvider abstraction.
 */

/** A catalog track (row of gs_anthem_tracks). */
export interface AnthemTrack {
  id: string;
  provider: string;
  providerTrackId: string;
  title: string;
  artist: string | null;
  genre: string | null;
  durationMs: number | null;
  audioUrl: string;
  artworkUrl: string | null;
  license: string | null;
  attribution: string | null;
  suggestedStartMs: number;
  isActive: boolean;
}

/** A user's personal anthem (row of gs_user_anthems). */
export interface UserAnthem {
  userId: string;
  trackId: string | null;
  startMs: number;
  durationMs: number;
  volume: number;
  enabled: boolean;
  updatedAt: string;
}

/** Editable fields when a user sets/updates their anthem. */
export interface UserAnthemInput {
  trackId: string | null;
  startMs: number;
  durationMs: number;
  volume: number;
  enabled: boolean;
}

/** When a walk-up fires. `first_chat` is the shipped default. */
export type AnthemTrigger = "first_chat" | "session_join" | "channel_points" | "manual";

/** Twitch roles a streamer can make eligible for a walk-up. */
export type AnthemRole = "subscriber" | "vip" | "moderator" | "mvp" | "everyone";

/** Per-streamer channel policy (row of gs_channel_anthem_policy). */
export interface ChannelAnthemPolicy {
  ownerUserId: string;
  enabled: boolean;
  trigger: AnthemTrigger;
  eligibleRoles: AnthemRole[];
  allowCustom: boolean;
  volume: number;
  cooldownSeconds: number;
  maxDurationMs: number;
  updatedAt: string | null;
}

/**
 * What the overlay needs to actually play an anthem. Produced by
 * resolveAnthemForTrigger() once all the policy/eligibility/servability checks
 * pass. Volume is already the effective (channel × personal) value.
 */
export interface ResolvedAnthem {
  trackId: string;
  audioUrl: string;
  title: string;
  artist: string | null;
  artworkUrl: string | null;
  startMs: number;
  durationMs: number;
  volume: number;
  attribution: string | null;
}

/** Clip-length guardrails (ms). 15s is the product target. */
export const ANTHEM_MIN_DURATION_MS = 3000;
export const ANTHEM_MAX_DURATION_MS = 15000;
export const ANTHEM_DEFAULT_DURATION_MS = 15000;
