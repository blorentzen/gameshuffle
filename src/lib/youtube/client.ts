/**
 * YouTube Data API v3 + Google OAuth client (pure fetch — no SDK).
 *
 * Covers exactly what the streamer integration needs:
 *   - OAuth: buildAuthorizeUrl / exchangeCodeForTokens / refreshAccessToken
 *   - Identity: getMyChannel (the connected channel)
 *   - Broadcast: getActiveLiveBroadcast (→ liveChatId, discovered per stream)
 *   - Chat: listLiveChatMessages (POLL) / insertLiveChatMessage (SEND)
 *
 * Unlike Twitch (EventSub push), YouTube live chat is READ by polling
 * `liveChatMessages.list`, which returns a `pollingIntervalMillis` telling you
 * when to poll again, plus a `nextPageToken` cursor. There is no webhook.
 *
 * Node.js runtime only.
 */

import "server-only";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YT_API_BASE = "https://www.googleapis.com/youtube/v3";

export class YouTubeApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "YouTubeApiError";
    this.status = status;
  }
}

function clientId(): string {
  const id = process.env.YOUTUBE_CLIENT_ID;
  if (!id) throw new YouTubeApiError("YOUTUBE_CLIENT_ID is not set", 500);
  return id;
}

function clientSecret(): string {
  const secret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!secret) throw new YouTubeApiError("YOUTUBE_CLIENT_SECRET is not set", 500);
  return secret;
}

/**
 * The OAuth redirect URI. Prefers NEXT_PUBLIC_BASE_URL (pinned in prod); falls
 * back to the incoming request origin so localhost dev works without config.
 * MUST exactly match an Authorized redirect URI in the Google Cloud OAuth
 * client, or Google rejects the flow with redirect_uri_mismatch.
 */
export function redirectUri(request?: Request): string {
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (request ? new URL(request.url).origin : "http://localhost:3000");
  return `${base.replace(/\/$/, "")}/api/youtube/auth/callback`;
}

export function buildAuthorizeUrl(state: string, scopeString: string, request?: Request): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(request),
    response_type: "code",
    scope: scopeString,
    // offline + consent are required to receive a refresh token from Google.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export interface OAuthTokens {
  accessToken: string;
  /** Google only returns a refresh token on the FIRST consent (or with
   *  prompt=consent). Null on re-auths that reuse an existing grant. */
  refreshToken: string | null;
  expiresInSeconds: number;
  scope: string;
}

export async function exchangeCodeForTokens(code: string, request?: Request): Promise<OAuthTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(request),
      grant_type: "authorization_code",
    }),
  });
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new YouTubeApiError(
      `token exchange failed: ${json.error ?? res.statusText} ${json.error_description ?? ""}`.trim(),
      res.status,
    );
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresInSeconds: json.expires_in ?? 3600,
    scope: json.scope ?? "",
  };
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new YouTubeApiError(
      `token refresh failed: ${json.error ?? res.statusText} ${json.error_description ?? ""}`.trim(),
      res.status,
    );
  }
  return { accessToken: json.access_token, expiresInSeconds: json.expires_in ?? 3600 };
}

/** Revoke a Google OAuth token (access or refresh). Revoking the refresh token
 *  invalidates the whole grant. Best-effort — returns whether Google accepted. */
export async function revokeGoogleToken(token: string): Promise<boolean> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function ytGet<T>(path: string, accessToken: string, params: Record<string, string>): Promise<T> {
  const url = `${YT_API_BASE}/${path}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new YouTubeApiError(`GET ${path} failed: ${res.status} ${body.slice(0, 300)}`, res.status);
  }
  return (await res.json()) as T;
}

export interface YouTubeChannel {
  id: string;
  title: string;
  handle: string | null;
}

/** The connected user's own channel (needs a channel — a plain Google account
 *  without a YouTube channel returns no items). */
export async function getMyChannel(accessToken: string): Promise<YouTubeChannel | null> {
  const data = await ytGet<{
    items?: Array<{ id: string; snippet?: { title?: string; customUrl?: string } }>;
  }>("channels", accessToken, { part: "snippet", mine: "true" });
  const item = data.items?.[0];
  if (!item) return null;
  return {
    id: item.id,
    title: item.snippet?.title ?? item.id,
    handle: item.snippet?.customUrl ?? null,
  };
}

export interface ActiveBroadcast {
  broadcastId: string;
  liveChatId: string | null;
  title: string;
  boundVideoId: string | null;
}

/**
 * The channel's currently-active live broadcast (if any). `liveChatId` is what
 * the chat poll/send calls key on. Returns null when the channel isn't live.
 */
export async function getActiveLiveBroadcast(accessToken: string): Promise<ActiveBroadcast | null> {
  const data = await ytGet<{
    items?: Array<{
      id: string;
      snippet?: { title?: string; liveChatId?: string };
      contentDetails?: { boundStreamId?: string };
    }>;
  }>("liveBroadcasts", accessToken, {
    part: "snippet,contentDetails",
    broadcastStatus: "active",
    broadcastType: "all",
    maxResults: "1",
  });
  const item = data.items?.[0];
  if (!item) return null;
  return {
    broadcastId: item.id,
    liveChatId: item.snippet?.liveChatId ?? null,
    title: item.snippet?.title ?? "",
    boundVideoId: item.contentDetails?.boundStreamId ?? null,
  };
}

export interface LiveChatMessage {
  id: string;
  authorChannelId: string;
  authorDisplayName: string;
  isModerator: boolean;
  isOwner: boolean;
  text: string;
  publishedAt: string;
}

export interface LiveChatPage {
  messages: LiveChatMessage[];
  nextPageToken: string | null;
  /** Server-dictated wait before the next poll. Respect it — polling faster
   *  gets the connection rate-limited. */
  pollingIntervalMillis: number;
}

/**
 * Poll a live chat. Pass the previous page's `nextPageToken` as `pageToken` to
 * get only new messages. The result's `pollingIntervalMillis` says when to poll
 * again.
 */
export async function listLiveChatMessages(
  accessToken: string,
  liveChatId: string,
  pageToken?: string | null,
): Promise<LiveChatPage> {
  const params: Record<string, string> = {
    liveChatId,
    part: "snippet,authorDetails",
    maxResults: "200",
  };
  if (pageToken) params.pageToken = pageToken;
  const data = await ytGet<{
    nextPageToken?: string;
    pollingIntervalMillis?: number;
    items?: Array<{
      id: string;
      snippet?: { displayMessage?: string; publishedAt?: string };
      authorDetails?: {
        channelId?: string;
        displayName?: string;
        isChatModerator?: boolean;
        isChatOwner?: boolean;
      };
    }>;
  }>("liveChat/messages", accessToken, params);
  return {
    messages: (data.items ?? []).map((m) => ({
      id: m.id,
      authorChannelId: m.authorDetails?.channelId ?? "",
      authorDisplayName: m.authorDetails?.displayName ?? "viewer",
      isModerator: !!m.authorDetails?.isChatModerator,
      isOwner: !!m.authorDetails?.isChatOwner,
      text: m.snippet?.displayMessage ?? "",
      publishedAt: m.snippet?.publishedAt ?? new Date().toISOString(),
    })),
    nextPageToken: data.nextPageToken ?? null,
    pollingIntervalMillis: data.pollingIntervalMillis ?? 5000,
  };
}

/** Post a message to a live chat as the connected channel. */
export async function insertLiveChatMessage(
  accessToken: string,
  liveChatId: string,
  text: string,
): Promise<{ ok: boolean; id?: string; error?: string; status: number }> {
  const url = `${YT_API_BASE}/liveChat/messages?part=snippet`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      snippet: {
        liveChatId,
        type: "textMessageEvent",
        textMessageDetails: { messageText: text.slice(0, 200) },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: body.slice(0, 300), status: res.status };
  }
  const json = (await res.json()) as { id?: string };
  return { ok: true, id: json.id, status: res.status };
}
