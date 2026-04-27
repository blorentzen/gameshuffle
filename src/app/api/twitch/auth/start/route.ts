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
import { canCreateSession, normalizeTier } from "@/lib/subscription";
import { resolveStaffImpersonation } from "@/lib/capabilities/staff-impersonation";

const STATE_COOKIE = "gs_twitch_oauth_state";
const STATE_COOKIE_MAX_AGE_SECONDS = 600; // 10 minutes

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", "/account?tab=integrations");
    return NextResponse.redirect(loginUrl);
  }

  // Tier gate — Pro only (or staff). Defense in depth; the hub page
  // already hides the button for free users.
  const admin = createTwitchAdminClient();
  const { data: userRow } = await admin
    .from("users")
    .select("subscription_tier, role")
    .eq("id", user.id)
    .maybeSingle();
  const impersonation = await resolveStaffImpersonation();
  const capabilityUser = {
    tier: normalizeTier(userRow?.subscription_tier as string | null),
    role: userRow?.role ?? null,
    viewingAsTier: impersonation.viewingAsTier ?? undefined,
  };
  if (!canCreateSession(capabilityUser)) {
    const back = new URL("/account", request.url);
    back.searchParams.set("tab", "integrations");
    back.searchParams.set("connect_error", "tier_gated");
    return NextResponse.redirect(back);
  }

  const state = randomBytes(24).toString("hex");
  // Pass `request` so dev origin (localhost) is used when env vars aren't pinned.
  const authorizeUrl = buildAuthorizeUrl(state, request);
  // Log the full authorize URL — when localhost dev bounces to prod,
  // this tells you exactly what redirect_uri was sent to Twitch.
  console.log(`[twitch-auth-start] origin=${new URL(request.url).origin} authorizeUrl=${authorizeUrl}`);

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
