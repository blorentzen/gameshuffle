/**
 * POST /api/twitch/sessions/test
 *
 * Body: { action: 'start', randomizerSlug: string } | { action: 'end' }
 *
 * Manually creates or ends a test session so the streamer can verify the
 * bot/randomizer flow without going live. A small slice of Phase 5's full
 * test mode — keeps just the session lifecycle so `!gs-shuffle` has
 * something to dispatch against.
 *
 * Sessions auto-expire after 30 minutes; the dashboard refresher picks
 * them up and treats expired ones as if they were ended.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTwitchAdminClient } from "@/lib/twitch/admin";
import { TWITCH_GAMES } from "@/lib/twitch/games";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body.action as string | undefined;

  const admin = createTwitchAdminClient();

  if (action === "end") {
    const { error } = await admin
      .from("twitch_sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("status", "test");
    if (error) {
      console.error("[twitch-test-session] end failed:", error);
      return NextResponse.json({ error: "end_failed" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  if (action !== "start") {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const slug = body.randomizerSlug as string | undefined;
  const game = slug ? TWITCH_GAMES[slug] : null;
  if (!game) {
    return NextResponse.json({ error: "unsupported_randomizer" }, { status: 400 });
  }

  // Refuse to start a test session while a real one is active — would
  // confuse the dashboard and the !gs-shuffle picker.
  const { data: existing } = await admin
    .from("twitch_sessions")
    .select("id, status")
    .eq("user_id", user.id)
    .in("status", ["active", "test"])
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "session_already_active", currentStatus: existing.status },
      { status: 409 }
    );
  }

  // Look up the corresponding twitch_category_id so the row is consistent
  // with what stream.online would create.
  const { data: category } = await admin
    .from("twitch_game_categories")
    .select("twitch_category_id")
    .eq("randomizer_slug", slug)
    .maybeSingle();

  const { data: inserted, error: insertErr } = await admin
    .from("twitch_sessions")
    .insert({
      user_id: user.id,
      randomizer_slug: slug,
      twitch_category_id: category?.twitch_category_id ?? "test",
      status: "test",
    })
    .select("id, started_at")
    .single();

  if (insertErr || !inserted) {
    console.error("[twitch-test-session] insert failed:", insertErr);
    return NextResponse.json({ error: "start_failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true, session: inserted });
}
