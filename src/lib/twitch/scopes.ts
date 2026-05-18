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
  // Mod accounts spec — required for Helix `GET /moderation/moderators`
  // so we can auto-import the streamer's Twitch mod list as pending
  // `streamer_mods` rows. Existing streamers who connected before this
  // scope was added will see a one-time "reconnect to enable mod
  // accounts" banner on the Twitch dashboard.
  "moderation:read",
] as const;

export type TwitchOAuthScope = (typeof TWITCH_OAUTH_SCOPES)[number];

/**
 * Test whether a connection's stored `scopes` array covers every scope
 * we currently request. Used by the Twitch dashboard to render a
 * "reconnect to enable new features" banner without forcing every
 * streamer through reauth at once — they reconnect when they hit a
 * surface that needs the new scope, not before.
 */
export function hasAllCurrentScopes(grantedScopes: string[] | null | undefined): boolean {
  if (!grantedScopes) return false;
  const granted = new Set(grantedScopes);
  return TWITCH_OAUTH_SCOPES.every((s) => granted.has(s));
}

/**
 * Return the list of scopes the streamer hasn't granted yet. Lets the
 * dashboard tell the streamer *what* they'll be authorizing when they
 * click reconnect.
 */
export function missingScopes(grantedScopes: string[] | null | undefined): TwitchOAuthScope[] {
  const granted = new Set(grantedScopes ?? []);
  return TWITCH_OAUTH_SCOPES.filter((s) => !granted.has(s));
}
