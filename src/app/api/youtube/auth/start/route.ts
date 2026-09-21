/**
 * GET /api/youtube/auth/start
 *
 * Initiates the YouTube (Google OAuth) streamer-integration flow. Verifies the
 * user is signed in + Pro-gated, sets a CSRF state cookie, and redirects to
 * Google's consent screen with the YouTube scopes (offline access so we get a
 * refresh token). Mirrors /api/twitch/auth/start.
 */

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { buildAuthorizeUrl } from "@/lib/youtube/client";
import { YOUTUBE_SCOPE_STRING } from "@/lib/youtube/scopes";
import { canCreateSession, normalizeTier } from "@/lib/subscription";
import { resolveStaffImpersonation } from "@/lib/capabilities/staff-impersonation";

const STATE_COOKIE = "gs_youtube_oauth_state";
const STATE_COOKIE_MAX_AGE_SECONDS = 600;

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

  // Tier gate — Pro (or staff). Defense in depth; the UI hides the button.
  const admin = createServiceClient();
  const { data: userRow } = await admin
    .from("users")
    .select("subscription_tier, role, circuit_tier, circuit_status")
    .eq("id", user.id)
    .maybeSingle();
  const impersonation = await resolveStaffImpersonation();
  const capabilityUser = {
    tier: normalizeTier(userRow?.subscription_tier as string | null),
    role: userRow?.role ?? null,
    viewingAsTier: impersonation.viewingAsTier ?? undefined,
    circuitTier: (userRow?.circuit_tier as string | null) ?? null,
    circuitStatus: (userRow?.circuit_status as string | null) ?? null,
  };
  if (!canCreateSession(capabilityUser)) {
    const back = new URL("/account", request.url);
    back.searchParams.set("tab", "integrations");
    back.searchParams.set("connect_error", "tier_gated");
    return NextResponse.redirect(back);
  }

  if (!process.env.YOUTUBE_CLIENT_ID) {
    const back = new URL("/account", request.url);
    back.searchParams.set("tab", "integrations");
    back.searchParams.set("connect_error", "youtube_not_configured");
    return NextResponse.redirect(back);
  }

  const state = randomBytes(24).toString("hex");
  const authorizeUrl = buildAuthorizeUrl(state, YOUTUBE_SCOPE_STRING, request);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set({
    name: STATE_COOKIE,
    value: state,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/youtube/auth",
    maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
