/**
 * GET /discord/add: the "Add to Discord" button on /discord.
 *
 * Signed in → the bot install flow (/api/discord/bot/install/start), which
 * links the server to this account. Signed out → sign up first (the signup
 * page explains why), then back here and on to the install. A page route, not
 * an API one, so the middleware's set-a-password step runs before the install.
 * `?app=comp`: the same for GameShuffle Competitive (picks 2026-10-30).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  // Same host the visitor is on (www), so the redirect doesn't bounce through the bare domain.
  const base = new URL(req.url).origin;
  const comp = new URL(req.url).searchParams.get("app") === "comp";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/signup?redirect=${encodeURIComponent(comp ? "/discord/add?app=comp" : "/discord/add")}`, base));
  return NextResponse.redirect(new URL(comp ? "/api/discord/bot/install/start?app=comp" : "/api/discord/bot/install/start", base));
}
