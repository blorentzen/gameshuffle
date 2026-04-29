/**
 * GET /api/twitch/overlay/[token]/latest?since=<iso>
 *
 * Public endpoint hit by the OBS browser-source overlay. Resolves an
 * overlay_token to its connection, finds the streamer's current active
 * (or test) session, and returns the most recent broadcaster shuffle
 * event newer than `since`. Viewer shuffles never come through here —
 * the overlay only animates broadcaster combos per spec §8.
 *
 * No auth: the overlay token IS the authorization. Anyone with the URL
 * (i.e. the streamer who pasted it into OBS) can read.
 *
 * Designed for ~2s polling — keep the query path tight.
 */

import { NextResponse } from "next/server";
import { createTwitchAdminClient } from "@/lib/twitch/admin";
import {
  findTwitchSessionForUser,
  getLatestTwitchShuffleEvent,
} from "@/lib/sessions/twitch-platform";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }

  const admin = createTwitchAdminClient();
  const { data: connection } = await admin
    .from("twitch_connections")
    .select("user_id, twitch_display_name")
    .eq("overlay_token", token)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ error: "unknown_token" }, { status: 404 });
  }

  const session = await findTwitchSessionForUser(connection.user_id, ["active", "test"]);

  if (!session) {
    return NextResponse.json({
      ok: true,
      broadcaster: connection.twitch_display_name,
      session: null,
      shuffle: null,
    });
  }

  const since = new URL(request.url).searchParams.get("since");
  const shuffle = await getLatestTwitchShuffleEvent(session.id, {
    broadcasterOnly: true,
    since,
  });

  return NextResponse.json({
    ok: true,
    broadcaster: connection.twitch_display_name,
    session: {
      id: session.id,
      randomizerSlug: session.randomizer_slug,
    },
    shuffle: shuffle
      ? {
          id: shuffle.id,
          displayName: shuffle.twitch_display_name,
          combo: shuffle.combo,
          createdAt: shuffle.created_at,
        }
      : null,
  });
}
