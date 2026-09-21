/**
 * YouTube connection store + transparent token refresh.
 *
 * Reads/writes `youtube_connections` (service role), decrypts the stored Google
 * OAuth tokens, and hands callers a VALID access token — refreshing via the
 * refresh token when the stored one is within the expiry skew. Mirrors
 * `src/lib/twitch/userToken.ts`.
 *
 * Node.js runtime only.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { decryptToken, encryptToken } from "./crypto";
import { refreshAccessToken } from "./client";

const EXPIRY_SKEW_MS = 60_000; // refresh a minute early

export interface YouTubeConnectionRow {
  id: string;
  user_id: string;
  youtube_channel_id: string | null;
  youtube_channel_title: string | null;
  youtube_channel_handle: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  scopes: string[] | null;
  active_live_chat_id: string | null;
  live_chat_poll_cursor: string | null;
  is_live: boolean | null;
  overlay_token: string | null;
}

const COLS =
  "id, user_id, youtube_channel_id, youtube_channel_title, youtube_channel_handle, access_token_encrypted, refresh_token_encrypted, token_expires_at, scopes, active_live_chat_id, live_chat_poll_cursor, is_live, overlay_token";

/** Read the connection row for a user (service role). Null when not connected
 *  OR when the table isn't migrated yet (guarded — degrades to "not connected"). */
export async function getYouTubeConnection(userId: string): Promise<YouTubeConnectionRow | null> {
  if (!userId) return null;
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("youtube_connections")
    .select(COLS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as YouTubeConnectionRow;
}

/** Look up a connection by channel id — used to map an incoming chat author /
 *  webhook-less poll back to the owning GS account. */
export async function getYouTubeConnectionByChannelId(
  channelId: string,
): Promise<YouTubeConnectionRow | null> {
  if (!channelId) return null;
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("youtube_connections")
    .select(COLS)
    .eq("youtube_channel_id", channelId)
    .maybeSingle();
  if (error || !data) return null;
  return data as YouTubeConnectionRow;
}

/**
 * Return a valid access token for the user's YouTube connection, refreshing +
 * persisting a new one when the stored token is expired/near-expiry. Returns
 * null when the user isn't connected or the refresh token is missing/invalid
 * (caller should surface a "reconnect YouTube" prompt).
 */
export async function getValidYouTubeAccessToken(userId: string): Promise<string | null> {
  const conn = await getYouTubeConnection(userId);
  if (!conn || !conn.access_token_encrypted) return null;

  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (expiresAt - EXPIRY_SKEW_MS > Date.now()) {
    try {
      return decryptToken(conn.access_token_encrypted);
    } catch {
      // fall through to refresh
    }
  }

  if (!conn.refresh_token_encrypted) return null;
  let refreshToken: string;
  try {
    refreshToken = decryptToken(conn.refresh_token_encrypted);
  } catch {
    return null;
  }

  try {
    const refreshed = await refreshAccessToken(refreshToken);
    const admin = createServiceClient();
    await admin
      .from("youtube_connections")
      .update({
        access_token_encrypted: encryptToken(refreshed.accessToken),
        token_expires_at: new Date(Date.now() + refreshed.expiresInSeconds * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", conn.id);
    return refreshed.accessToken;
  } catch {
    return null;
  }
}

/** Persist (upsert) a connection after a successful OAuth exchange. A null
 *  refresh token (Google reuse-grant re-auth) preserves the stored one. */
export async function upsertYouTubeConnection(args: {
  userId: string;
  channelId: string;
  channelTitle: string;
  channelHandle: string | null;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt: string;
  scopes: string[];
}): Promise<void> {
  const admin = createServiceClient();
  const base: Record<string, unknown> = {
    user_id: args.userId,
    youtube_channel_id: args.channelId,
    youtube_channel_title: args.channelTitle,
    youtube_channel_handle: args.channelHandle,
    access_token_encrypted: args.accessTokenEncrypted,
    token_expires_at: args.tokenExpiresAt,
    scopes: args.scopes,
    updated_at: new Date().toISOString(),
  };
  // Only overwrite the refresh token when Google actually returned a new one.
  if (args.refreshTokenEncrypted) base.refresh_token_encrypted = args.refreshTokenEncrypted;
  await admin.from("youtube_connections").upsert(base, { onConflict: "user_id" });
}
