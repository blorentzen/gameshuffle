/**
 * GET /api/live/[streamer-slug]/viewers — all-up live viewer count for a
 * streamer's /live page. Resolves the slug to the owner (username, then
 * twitch_username, matching the /live page's slug resolution) and returns the
 * cached counts. Public read; the counts lib caches ~20s so this poll is cheap.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getViewerCountsForOwner } from "@/lib/streams/viewers";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ "streamer-slug": string }> },
) {
  const { "streamer-slug": rawSlug } = await params;
  const s = rawSlug.toLowerCase();
  const admin = createServiceClient();

  // Two exact-match queries (not a PostgREST `.or` on raw input) so the slug
  // can never inject into the filter.
  let ownerId: string | null = null;
  const byUsername = await admin.from("users").select("id").eq("username", s).maybeSingle();
  ownerId = (byUsername.data as { id?: string } | null)?.id ?? null;
  if (!ownerId) {
    const byTwitch = await admin.from("users").select("id").eq("twitch_username", s).maybeSingle();
    ownerId = (byTwitch.data as { id?: string } | null)?.id ?? null;
  }

  if (!ownerId) {
    return NextResponse.json({ total: 0, live: false, platforms: [] });
  }

  const viewers = await getViewerCountsForOwner(ownerId).catch(() => ({
    total: 0,
    live: false,
    platforms: [],
  }));
  return NextResponse.json(viewers);
}
