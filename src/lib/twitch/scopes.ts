/**
 * Twitch OAuth scope bundle for the GameShuffle Streamer Integration.
 *
 * Bundled into the single consent screen so streamers grant everything
 * upfront — there is no separate "authorize bot" step later.
 */

export const TWITCH_OAUTH_SCOPES = [
  "user:read:email",
  // Bot needs to read messages from this channel to parse !gs-* commands.
  // The user grants the broadcaster-side scope; the bot side authorizes via
  // its own user:read:chat token (Phase 2).
  "user:read:chat",
  // Authorizes GameShuffle's bot account to send chat in this channel.
  "channel:bot",
  // Channel point reward management for the per-streamer "Randomize" reward.
  "channel:read:redemptions",
  "channel:manage:redemptions",
] as const;

export type TwitchOAuthScope = (typeof TWITCH_OAUTH_SCOPES)[number];
