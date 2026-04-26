/**
 * Twitch Helix API client + OAuth helpers.
 *
 * Used by:
 *  - OAuth callback (token exchange + user lookup)
 *  - EventSub manager (create/delete subscriptions)
 *  - Disconnect endpoint (revoke + cleanup)
 *  - Future: bot chat sends, channel point reward management
 */

import { TWITCH_OAUTH_SCOPES } from "./scopes";

const TWITCH_OAUTH_BASE = "https://id.twitch.tv/oauth2";
const TWITCH_HELIX_BASE = "https://api.twitch.tv/helix";

function clientId(): string {
  const id = process.env.TWITCH_CLIENT_ID;
  if (!id) throw new Error("TWITCH_CLIENT_ID env var is not set");
  return id;
}

function clientSecret(): string {
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!secret) throw new Error("TWITCH_CLIENT_SECRET env var is not set");
  return secret;
}

/**
 * Resolve the OAuth redirect_uri Twitch will send the user back to.
 *
 * Priority:
 *   1. `TWITCH_OAUTH_REDIRECT_URI` env var (verbatim — explicit pin)
 *   2. `NEXT_PUBLIC_BASE_URL` env var + /api/twitch/auth/callback
 *   3. Origin of the incoming `request` (when passed) — lets localhost dev
 *      "just work" without overriding env vars set for prod
 *   4. Hardcoded production URL — final fallback so server-only callers
 *      that genuinely have no request context don't 500
 *
 * The same value MUST be returned for both the authorize URL build AND
 * the code exchange, or Twitch rejects with `invalid_grant`. Both call
 * sites (auth/start, auth/callback) pass `request` so they agree on origin.
 */
export function oauthRedirectUri(request?: Request): string {
  let resolved: string;
  let source: string;
  if (process.env.TWITCH_OAUTH_REDIRECT_URI) {
    resolved = process.env.TWITCH_OAUTH_REDIRECT_URI;
    source = "env:TWITCH_OAUTH_REDIRECT_URI";
  } else if (process.env.NEXT_PUBLIC_BASE_URL) {
    resolved = `${process.env.NEXT_PUBLIC_BASE_URL}/api/twitch/auth/callback`;
    source = "env:NEXT_PUBLIC_BASE_URL";
  } else if (request) {
    try {
      const origin = new URL(request.url).origin;
      resolved = `${origin}/api/twitch/auth/callback`;
      source = "request.url origin";
    } catch {
      resolved = "https://www.gameshuffle.co/api/twitch/auth/callback";
      source = "hardcoded fallback (request.url unparseable)";
    }
  } else {
    resolved = "https://www.gameshuffle.co/api/twitch/auth/callback";
    source = "hardcoded fallback (no env, no request)";
  }
  // Loud server-side log — surfaces in `npm run dev` output. Removes
  // ambiguity when the OAuth callback bounces to the wrong origin: this
  // tells you exactly which input "won" priority resolution.
  console.log(`[twitch-oauth] redirect_uri resolved → ${resolved} (source: ${source})`);
  return resolved;
}

/** Build the Twitch OAuth authorize URL. */
export function buildAuthorizeUrl(state: string, request?: Request): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: oauthRedirectUri(request),
    response_type: "code",
    scope: TWITCH_OAUTH_SCOPES.join(" "),
    state,
    force_verify: "true",
  });
  return `${TWITCH_OAUTH_BASE}/authorize?${params.toString()}`;
}

export interface TwitchTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  scope: string[];
  token_type: "bearer";
}

/**
 * Exchange an authorization code for an access + refresh token pair.
 *
 * Pass `request` so the redirect_uri sent here matches the one used by
 * `buildAuthorizeUrl` upstream. Twitch rejects mismatches with
 * `invalid_grant`.
 */
export async function exchangeCode(code: string, request?: Request): Promise<TwitchTokenResponse> {
  const params = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    code,
    grant_type: "authorization_code",
    redirect_uri: oauthRedirectUri(request),
  });

  const res = await fetch(`${TWITCH_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Twitch OAuth code exchange failed (${res.status}): ${body}`);
  }
  return (await res.json()) as TwitchTokenResponse;
}

/** Refresh an access token using a refresh token. */
export async function refreshAccessToken(refreshToken: string): Promise<TwitchTokenResponse> {
  const params = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch(`${TWITCH_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Twitch OAuth refresh failed (${res.status}): ${body}`);
  }
  return (await res.json()) as TwitchTokenResponse;
}

/** Revoke an access token (used on disconnect). */
export async function revokeToken(accessToken: string): Promise<void> {
  const params = new URLSearchParams({
    client_id: clientId(),
    token: accessToken,
  });
  // Twitch returns 200 even for already-revoked tokens; we don't fail the disconnect on revoke errors.
  await fetch(`${TWITCH_OAUTH_BASE}/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  }).catch(() => undefined);
}

export interface HelixUser {
  id: string;
  login: string;
  display_name: string;
  email?: string;
  profile_image_url?: string;
  broadcaster_type?: "" | "affiliate" | "partner";
}

/** Fetch the authenticated user's Twitch profile. */
export async function getAuthenticatedUser(accessToken: string): Promise<HelixUser> {
  const res = await fetch(`${TWITCH_HELIX_BASE}/users`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId(),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Twitch Helix /users failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { data: HelixUser[] };
  if (!data.data?.[0]) throw new Error("Twitch Helix /users returned no user");
  return data.data[0];
}

// ---------------------------------------------------------------------------
// App access token (used for EventSub webhook subscriptions — Twitch requires
// these be created with an app access token, NOT a user token).
// ---------------------------------------------------------------------------

let cachedAppToken: { token: string; expiresAt: number } | null = null;

export async function getAppAccessToken(): Promise<string> {
  // Return cached if still valid (with 60s buffer)
  if (cachedAppToken && cachedAppToken.expiresAt > Date.now() + 60_000) {
    return cachedAppToken.token;
  }

  const params = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: "client_credentials",
  });

  const res = await fetch(`${TWITCH_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Twitch app token request failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedAppToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Chat (bot → broadcaster's channel)
// ---------------------------------------------------------------------------
// Uses app access token. Works because the bot has granted `user:bot` and
// the broadcaster has granted `channel:bot` to our app in their respective
// OAuth consent flows — those two grants together let the app token send
// chat on the bot's behalf in the broadcaster's channel.

export async function sendChatMessage(args: {
  broadcasterId: string;
  senderId: string;
  message: string;
}): Promise<void> {
  const appToken = await getAppAccessToken();
  const res = await fetch(`${TWITCH_HELIX_BASE}/chat/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${appToken}`,
      "Client-Id": clientId(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      broadcaster_id: args.broadcasterId,
      sender_id: args.senderId,
      message: args.message,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Helix POST /chat/messages failed (${res.status}): ${body}`);
  }
  // Twitch returns { data: [{ message_id, is_sent, drop_reason }] }. We trust
  // a 2xx response and don't fail on is_sent=false (auto-mod hold etc.) —
  // nothing to do about it from our side.
}

// ---------------------------------------------------------------------------
// Channel info (category lookup for stream.online, etc.)
// ---------------------------------------------------------------------------

export interface HelixChannelInfo {
  broadcaster_id: string;
  broadcaster_login: string;
  broadcaster_name: string;
  game_id: string;
  game_name: string;
  title: string;
}

/** Fetch a broadcaster's current channel info (uses app token). */
export async function getChannelInfo(broadcasterUserId: string): Promise<HelixChannelInfo | null> {
  const appToken = await getAppAccessToken();
  const res = await fetch(
    `${TWITCH_HELIX_BASE}/channels?broadcaster_id=${encodeURIComponent(broadcasterUserId)}`,
    {
      headers: {
        Authorization: `Bearer ${appToken}`,
        "Client-Id": clientId(),
      },
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Helix /channels failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { data: HelixChannelInfo[] };
  return data.data?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// EventSub subscription Helix calls
// ---------------------------------------------------------------------------

export interface EventSubCondition {
  broadcaster_user_id?: string;
  user_id?: string;
  reward_id?: string;
}

export interface EventSubSubscription {
  id: string;
  status: string;
  type: string;
  version: string;
  condition: EventSubCondition;
  created_at: string;
}

export interface CreateEventSubResponse {
  data: EventSubSubscription[];
}

export async function createEventSubSubscription(args: {
  type: string;
  version: string;
  condition: EventSubCondition;
  callback: string;
  secret: string;
}): Promise<EventSubSubscription> {
  const appToken = await getAppAccessToken();
  const res = await fetch(`${TWITCH_HELIX_BASE}/eventsub/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${appToken}`,
      "Client-Id": clientId(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: args.type,
      version: args.version,
      condition: args.condition,
      transport: {
        method: "webhook",
        callback: args.callback,
        secret: args.secret,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`EventSub create failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as CreateEventSubResponse;
  if (!data.data?.[0]) throw new Error("EventSub create returned no subscription");
  return data.data[0];
}

export async function deleteEventSubSubscription(subscriptionId: string): Promise<void> {
  const appToken = await getAppAccessToken();
  const res = await fetch(
    `${TWITCH_HELIX_BASE}/eventsub/subscriptions?id=${encodeURIComponent(subscriptionId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${appToken}`,
        "Client-Id": clientId(),
      },
    }
  );
  // 404 means already gone — fine
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`EventSub delete failed (${res.status}): ${body}`);
  }
}
