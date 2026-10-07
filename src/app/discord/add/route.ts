/**
 * GET /discord/add: the "Add to Discord" button on /discord.
 *
 * Signed in → the bot install flow (/api/discord/bot/install/start), which
 * links the server to this account. Signed out → sign up first (the signup
 * page explains why), then back here and on to the install. A page route, not
 * an API one, so the middleware's set-a-password step runs before the install.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  // Same host the visitor is on (www), so the redirect doesn't bounce through the bare domain.
  const base = new URL(req.url).origin;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/signup?redirect=${encodeURIComponent("/discord/add")}`, base));
  return NextResponse.redirect(new URL("/api/discord/bot/install/start", base));
}
