/**
 * GET /api/live/[streamer-slug]/bounties
 *
 * Returns open bounties for the streamer's active stream. Polled by
 * the /live page Markets tab alongside the market state. Public —
 * no auth required.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getCommunityBySlug } from "@/lib/economy/community";
import { getActiveStreamForCommunity } from "@/lib/economy/streams";
import { listOpenBountiesForStream } from "@/lib/economy/bounties";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ "streamer-slug": string }> },
) {
  const { "streamer-slug": slug } = await params;
  if (!slug) {
    return NextResponse.json({ error: "missing_slug" }, { status: 400 });
  }

  const admin = createServiceClient();

  // Slug → community. Honor the same fallback chain the rest of /live
  // uses (gs_communities.slug first, then users.username /
  // twitch_username).
  let community = await getCommunityBySlug(slug);
  if (!community) {
    const { data: byUsername } = await admin
      .from("users")
      .select("username, twitch_username")
      .or(`username.eq.${slug},twitch_username.eq.${slug}`)
      .maybeSingle();
    const fallback =
      ((byUsername as { username?: string | null } | null)?.username ?? null) ||
      ((byUsername as { twitch_username?: string | null } | null)?.twitch_username ?? null);
    if (fallback) community = await getCommunityBySlug(fallback);
  }
  if (!community) {
    return NextResponse.json({ bounties: [] });
  }

  const stream = await getActiveStreamForCommunity(community.id);
  if (!stream) {
    return NextResponse.json({ bounties: [] });
  }
  const rows = await listOpenBountiesForStream(stream.id);
  return NextResponse.json({
    bounties: rows.map((b) => ({
      id: b.id,
      amount: Number(b.amount),
      description: b.description,
      createdAt: b.created_at,
    })),
  });
}
