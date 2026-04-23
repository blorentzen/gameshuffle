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

export const runtime = "nodejs";

interface ShuffleRow {
  id: string;
  twitch_display_name: string;
  combo: Record<string, unknown> | null;
  created_at: string;
}

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

  const { data: session } = await admin
    .from("twitch_sessions")
    .select("id, randomizer_slug")
    .eq("user_id", connection.user_id)
    .in("status", ["active", "test"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({
      ok: true,
      broadcaster: connection.twitch_display_name,
      session: null,
      shuffle: null,
    });
  }

  const since = new URL(request.url).searchParams.get("since");
  let query = admin
    .from("twitch_shuffle_events")
    .select("id, twitch_display_name, combo, created_at")
    .eq("session_id", session.id)
    .eq("is_broadcaster", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (since) {
    query = query.gt("created_at", since);
  }

  const { data: rows } = await query;
  const shuffle = (rows as ShuffleRow[] | null)?.[0] ?? null;

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
