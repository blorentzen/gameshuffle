/**
 * GET /api/live/[streamer-slug]/events → { modifiers, challenges }
 *
 * Viewer-facing in-flight event state for the streamer's active session:
 * active modifiers + open PUBLIC challenges (secret missions excluded). Public
 * read, no auth. Returns empty arrays (200) when the streamer has no active
 * session — the UI shows an empty state, not an error. Polled by the Events tab.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { listLiveSessionEvents } from "@/lib/economy/events/live";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ "streamer-slug": string }> },
) {
  const { "streamer-slug": slug } = await params;
  if (!slug) return NextResponse.json({ error: "missing_slug" }, { status: 400 });

  const admin = createServiceClient();
  const fields = "id, username, twitch_username";
  const { data: byUsername } = await admin
    .from("users")
    .select(fields)
    .eq("username", slug)
    .maybeSingle();
  const streamer =
    byUsername ??
    (
      await admin
        .from("users")
        .select(fields)
        .eq("twitch_username", slug)
        .limit(1)
        .maybeSingle()
    ).data;
  if (!streamer) {
    return NextResponse.json({ modifiers: [], challenges: [] });
  }

  const { data: sessionRow } = await admin
    .from("gs_sessions")
    .select("id")
    .eq("owner_user_id", (streamer as { id: string }).id)
    .in("status", ["active", "ending"])
    .order("activated_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!sessionRow) {
    return NextResponse.json({ modifiers: [], challenges: [] });
  }

  const events = await listLiveSessionEvents((sessionRow as { id: string }).id);
  return NextResponse.json(events);
}
