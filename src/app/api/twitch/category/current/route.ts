/**
 * GET /api/twitch/category/current
 *
 * Returns the authenticated streamer's current Twitch channel category
 * plus the matching GameShuffle randomizer slug (if we support it).
 *
 * Used by the dashboard to pre-fill the test-session game picker — same
 * detection logic the stream.online webhook uses for live sessions, just
 * exposed as a UI helper. Auth: streamer must be signed in to GS.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTwitchAdminClient } from "@/lib/twitch/admin";
import { getChannelInfo } from "@/lib/twitch/client";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const admin = createTwitchAdminClient();
  const { data: connection } = await admin
    .from("twitch_connections")
    .select("twitch_user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!connection?.twitch_user_id) {
    return NextResponse.json({ error: "not_connected" }, { status: 400 });
  }

  let channel;
  try {
    channel = await getChannelInfo(connection.twitch_user_id);
  } catch (err) {
    console.error("[twitch-category-current] Helix call failed:", err);
    return NextResponse.json({ error: "twitch_lookup_failed" }, { status: 502 });
  }

  if (!channel) {
    return NextResponse.json({
      ok: true,
      categoryId: null,
      categoryName: null,
      randomizerSlug: null,
      supported: false,
    });
  }

  const categoryId = channel.game_id || null;
  const categoryName = channel.game_name || null;

  let slug: string | null = null;
  if (categoryId) {
    const { data: mapping } = await admin
      .from("twitch_game_categories")
      .select("randomizer_slug, active")
      .eq("twitch_category_id", categoryId)
      .maybeSingle();
    if (mapping?.active) slug = mapping.randomizer_slug as string;
  }

  return NextResponse.json({
    ok: true,
    categoryId,
    categoryName,
    randomizerSlug: slug,
    supported: !!slug,
  });
}
