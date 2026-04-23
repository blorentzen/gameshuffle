/**
 * GET /api/twitch/auth/callback
 *
 * Twitch OAuth redirect target. Exchanges code for tokens, encrypts and
 * stores them, generates the persistent overlay token, and creates initial
 * EventSub subscriptions.
 */

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createTwitchAdminClient } from "@/lib/twitch/admin";
import { encryptToken } from "@/lib/twitch/crypto";
import { exchangeCode, getAuthenticatedUser } from "@/lib/twitch/client";
import { subscribeForConnection } from "@/lib/twitch/eventsub";
import { TWITCH_OAUTH_SCOPES } from "@/lib/twitch/scopes";

const STATE_COOKIE = "gs_twitch_oauth_state";

function dashboardRedirect(request: Request, params: Record<string, string>): NextResponse {
  const url = new URL("/account", request.url);
  url.searchParams.set("tab", "twitch-hub");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const response = NextResponse.redirect(url);
  // Always clear the state cookie on callback completion
  response.cookies.set({
    name: STATE_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/twitch/auth",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return dashboardRedirect(request, { connect_error: error });
  }
  if (!code || !state) {
    return dashboardRedirect(request, { connect_error: "missing_params" });
  }

  // Verify state matches the cookie (CSRF)
  const cookieHeader = request.headers.get("cookie") || "";
  const stateCookie = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${STATE_COOKIE}=`))
    ?.split("=")[1];

  if (!stateCookie || stateCookie !== state) {
    return dashboardRedirect(request, { connect_error: "state_mismatch" });
  }

  // Verify GameShuffle user is signed in
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", "/account?tab=twitch-hub");
    return NextResponse.redirect(loginUrl);
  }

  let tokens;
  let twitchUser;
  try {
    tokens = await exchangeCode(code);
    twitchUser = await getAuthenticatedUser(tokens.access_token);
  } catch (err) {
    console.error("[twitch-callback] OAuth exchange failed:", err);
    return dashboardRedirect(request, { connect_error: "token_exchange_failed" });
  }

  // Encrypt tokens before storage
  const accessTokenEncrypted = encryptToken(tokens.access_token);
  const refreshTokenEncrypted = encryptToken(tokens.refresh_token);

  // Persist connection (upsert by user_id)
  const admin = createTwitchAdminClient();
  const overlayToken = randomBytes(24).toString("base64url");
  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Check if a row already exists so we don't blow away the existing overlay_token
  const { data: existing } = await admin
    .from("twitch_connections")
    .select("id, overlay_token")
    .eq("user_id", user.id)
    .maybeSingle();

  const upsertPayload = {
    user_id: user.id,
    twitch_user_id: twitchUser.id,
    twitch_login: twitchUser.login,
    twitch_display_name: twitchUser.display_name,
    access_token_encrypted: accessTokenEncrypted,
    refresh_token_encrypted: refreshTokenEncrypted,
    token_expires_at: tokenExpiresAt,
    scopes: tokens.scope?.length ? tokens.scope : Array.from(TWITCH_OAUTH_SCOPES),
    bot_authorized: true,
    overlay_token: existing?.overlay_token ?? overlayToken,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error: updateErr } = await admin
      .from("twitch_connections")
      .update(upsertPayload)
      .eq("id", existing.id);
    if (updateErr) {
      console.error("[twitch-callback] update failed:", updateErr);
      return dashboardRedirect(request, { connect_error: "db_write_failed" });
    }
  } else {
    const { error: insertErr } = await admin
      .from("twitch_connections")
      .insert(upsertPayload);
    if (insertErr) {
      console.error("[twitch-callback] insert failed:", insertErr);
      return dashboardRedirect(request, { connect_error: "db_write_failed" });
    }
  }

  // Subscribe to EventSub events. Best-effort — don't fail the whole flow.
  try {
    await subscribeForConnection({ userId: user.id, twitchUserId: twitchUser.id });
  } catch (err) {
    console.error("[twitch-callback] EventSub subscribe failed:", err);
  }

  return dashboardRedirect(request, { connected: "1" });
}
