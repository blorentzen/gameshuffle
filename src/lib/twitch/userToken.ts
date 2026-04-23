/**
 * "Get a valid user access token for this connection" helper.
 *
 * Channel point management (and other broadcaster-scoped Helix calls)
 * require the streamer's own user access token, not our app token.
 * Tokens expire (~4 hours) so we transparently refresh when needed and
 * persist the new pair back to twitch_connections so the next caller
 * doesn't have to.
 *
 * Returns the decrypted access token. Use it with a Bearer header in a
 * Helix call. Pair with `withUserTokenRetry` (below) to auto-refresh
 * on 401.
 */

import { decryptToken, encryptToken, TwitchCryptoError } from "./crypto";
import { refreshAccessToken } from "./client";
import { createTwitchAdminClient } from "./admin";

// Refresh ~5 minutes before expiry so a long-running operation won't hit
// a mid-flight 401 in the common case.
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

interface ConnectionTokens {
  id: string;
  user_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: string;
  scopes: string[] | null;
}

export class UserTokenError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "UserTokenError";
    this.code = code;
  }
}

async function getTokensRow(userId: string): Promise<ConnectionTokens | null> {
  const admin = createTwitchAdminClient();
  const { data } = await admin
    .from("twitch_connections")
    .select("id, user_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, scopes")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as ConnectionTokens | null) ?? null;
}

async function persistRefreshedTokens(args: {
  connectionId: string;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  scopes: string[];
}): Promise<void> {
  const admin = createTwitchAdminClient();
  await admin
    .from("twitch_connections")
    .update({
      access_token_encrypted: encryptToken(args.accessToken),
      refresh_token_encrypted: encryptToken(args.refreshToken),
      token_expires_at: new Date(Date.now() + args.expiresInSeconds * 1000).toISOString(),
      scopes: args.scopes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.connectionId);
}

/** Get a usable access token for the user, refreshing if needed. */
export async function getValidUserAccessToken(userId: string): Promise<string> {
  const row = await getTokensRow(userId);
  if (!row) throw new UserTokenError("No twitch_connections row for user", "no_connection");
  if (!row.access_token_encrypted || !row.refresh_token_encrypted) {
    throw new UserTokenError("Connection is missing encrypted tokens", "missing_tokens");
  }

  const expiresMs = Date.parse(row.token_expires_at);
  const stillFresh = Number.isFinite(expiresMs) && expiresMs - Date.now() > REFRESH_BUFFER_MS;
  if (stillFresh) {
    try {
      return decryptToken(row.access_token_encrypted);
    } catch (err) {
      if (!(err instanceof TwitchCryptoError)) throw err;
      // Fall through and refresh.
    }
  }

  // Refresh path
  let refreshToken: string;
  try {
    refreshToken = decryptToken(row.refresh_token_encrypted);
  } catch (err) {
    if (err instanceof TwitchCryptoError) {
      throw new UserTokenError("Refresh token decrypt failed — user must reconnect", "decrypt_failed");
    }
    throw err;
  }

  const refreshed = await refreshAccessToken(refreshToken);
  await persistRefreshedTokens({
    connectionId: row.id,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    expiresInSeconds: refreshed.expires_in,
    scopes: refreshed.scope ?? row.scopes ?? [],
  });
  return refreshed.access_token;
}

/**
 * Force a refresh on demand (e.g. after a 401 from Helix). Bypasses
 * the freshness check.
 */
export async function forceRefreshUserToken(userId: string): Promise<string> {
  const row = await getTokensRow(userId);
  if (!row) throw new UserTokenError("No twitch_connections row for user", "no_connection");
  let refreshToken: string;
  try {
    refreshToken = decryptToken(row.refresh_token_encrypted);
  } catch {
    throw new UserTokenError("Refresh token decrypt failed", "decrypt_failed");
  }
  const refreshed = await refreshAccessToken(refreshToken);
  await persistRefreshedTokens({
    connectionId: row.id,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    expiresInSeconds: refreshed.expires_in,
    scopes: refreshed.scope ?? row.scopes ?? [],
  });
  return refreshed.access_token;
}

/**
 * Run a fetch-style operation with a user access token; if the call
 * returns 401, force-refresh the token and retry once. Pass a closure
 * that takes the token and returns a Response.
 */
export async function withUserTokenRetry(
  userId: string,
  operation: (accessToken: string) => Promise<Response>
): Promise<Response> {
  const token = await getValidUserAccessToken(userId);
  const first = await operation(token);
  if (first.status !== 401) return first;

  const fresh = await forceRefreshUserToken(userId);
  return operation(fresh);
}
