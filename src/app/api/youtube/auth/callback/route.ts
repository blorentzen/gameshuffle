/**
 * GET /api/youtube/auth/callback
 *
 * Google OAuth redirect target for the YouTube integration. Verifies CSRF
 * state, exchanges the code for tokens, resolves the connected channel,
 * encrypts + stores the tokens, and mints a persistent overlay token. Mirrors
 * /api/twitch/auth/callback.
 */

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { encryptToken } from "@/lib/youtube/crypto";
import { exchangeCodeForTokens, getMyChannel } from "@/lib/youtube/client";
import { YOUTUBE_SCOPES } from "@/lib/youtube/scopes";
import { upsertYouTubeConnection } from "@/lib/youtube/connection";

const STATE_COOKIE = "gs_youtube_oauth_state";

function dashboardRedirect(request: Request, params: Record<string, string>): NextResponse {
  const url = new URL("/account", request.url);
  url.searchParams.set("tab", "integrations");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const response = NextResponse.redirect(url);
  response.cookies.set({
    name: STATE_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/youtube/auth",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) return dashboardRedirect(request, { connect_error: error });
  if (!code || !state) return dashboardRedirect(request, { connect_error: "missing_params" });

  const cookieHeader = request.headers.get("cookie") || "";
  const stateCookie = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${STATE_COOKIE}=`))
    ?.split("=")[1];
  if (!stateCookie || stateCookie !== state) {
    return dashboardRedirect(request, { connect_error: "state_mismatch" });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", "/account?tab=integrations");
    return NextResponse.redirect(loginUrl);
  }

  let tokens;
  let channel;
  try {
    tokens = await exchangeCodeForTokens(code, request);
    channel = await getMyChannel(tokens.accessToken);
  } catch (err) {
    console.error("[youtube-callback] OAuth exchange failed:", err);
    return dashboardRedirect(request, { connect_error: "token_exchange_failed" });
  }

  if (!channel) {
    // A Google account with no YouTube channel — can't run the integration.
    return dashboardRedirect(request, { connect_error: "no_youtube_channel" });
  }

  try {
    // Preserve any existing overlay token so the OBS URL stays stable.
    const admin = createServiceClient();
    const { data: existing } = await admin
      .from("youtube_connections")
      .select("overlay_token")
      .eq("user_id", user.id)
      .maybeSingle();
    const overlayToken =
      (existing as { overlay_token: string | null } | null)?.overlay_token ??
      randomBytes(24).toString("base64url");

    await upsertYouTubeConnection({
      userId: user.id,
      channelId: channel.id,
      channelTitle: channel.title,
      channelHandle: channel.handle,
      accessTokenEncrypted: encryptToken(tokens.accessToken),
      refreshTokenEncrypted: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
      tokenExpiresAt: new Date(Date.now() + tokens.expiresInSeconds * 1000).toISOString(),
      scopes: tokens.scope ? tokens.scope.split(" ") : Array.from(YOUTUBE_SCOPES),
    });

    // Ensure the overlay token exists on the row (upsert above doesn't set it).
    await admin
      .from("youtube_connections")
      .update({ overlay_token: overlayToken })
      .eq("user_id", user.id)
      .is("overlay_token", null);
  } catch (err) {
    console.error("[youtube-callback] db write failed:", err);
    return dashboardRedirect(request, { connect_error: "db_write_failed" });
  }

  return dashboardRedirect(request, { connected: "youtube" });
}
