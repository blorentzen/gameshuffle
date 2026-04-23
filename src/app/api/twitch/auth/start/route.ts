/**
 * GET /api/twitch/auth/start
 *
 * Initiates the streamer-integration OAuth flow.
 *
 * Verifies the user is signed in to GameShuffle, generates a CSRF state
 * token (stored in an HTTP-only cookie), and redirects to Twitch's authorize
 * endpoint with the full streamer scope bundle.
 */

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createTwitchAdminClient } from "@/lib/twitch/admin";
import { buildAuthorizeUrl } from "@/lib/twitch/client";
import {
  canUseTwitchIntegration,
  effectiveTier,
  type SubscriptionTier,
} from "@/lib/subscription";

const STATE_COOKIE = "gs_twitch_oauth_state";
const STATE_COOKIE_MAX_AGE_SECONDS = 600; // 10 minutes

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", "/account?tab=twitch-hub");
    return NextResponse.redirect(loginUrl);
  }

  // Tier gate — Creator+ only (or staff). Defense in depth; the hub
  // page already hides the button for free users.
  const admin = createTwitchAdminClient();
  const { data: userRow } = await admin
    .from("users")
    .select("subscription_tier, role")
    .eq("id", user.id)
    .maybeSingle();
  const tier = effectiveTier({
    tier: ((userRow?.subscription_tier as SubscriptionTier) ?? "free"),
    role: userRow?.role ?? null,
  });
  if (!canUseTwitchIntegration(tier)) {
    const back = new URL("/account", request.url);
    back.searchParams.set("tab", "twitch-hub");
    back.searchParams.set("connect_error", "tier_gated");
    return NextResponse.redirect(back);
  }

  const state = randomBytes(24).toString("hex");
  const authorizeUrl = buildAuthorizeUrl(state);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set({
    name: STATE_COOKIE,
    value: state,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/twitch/auth",
    maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
