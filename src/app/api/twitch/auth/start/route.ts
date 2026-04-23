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
import { buildAuthorizeUrl } from "@/lib/twitch/client";

const STATE_COOKIE = "gs_twitch_oauth_state";
const STATE_COOKIE_MAX_AGE_SECONDS = 600; // 10 minutes

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", "/twitch");
    return NextResponse.redirect(loginUrl);
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
