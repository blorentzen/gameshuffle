/**
 * GET /api/live/[streamer-slug]/leaderboard?kind=combined|player|crowd&limit=10
 *
 * Public read for the /live page leaderboard tab. Polled every 15s
 * by the client; cheap because `gs_leaderboard_*` RPCs run on derived
 * indices over `token_events`.
 *
 * Public surface — no auth required. The leaderboard is the same
 * data the chat `!leaderboard` returns; surfacing it here is just a
 * different rendering of community-scoped tokens.
 *
 * Returns an empty list (200) for streamers without a community yet
 * (no chat or web activity) rather than 404 — the UI shows an empty
 * state that explains "be the first to earn here."
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getCommunityBySlug } from "@/lib/economy/community";
import {
  getLeaderboard,
  type LeaderboardKind,
} from "@/lib/economy/leaderboards";

export const runtime = "nodejs";

const VALID_KINDS = new Set<LeaderboardKind>(["combined", "player", "crowd"]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ "streamer-slug": string }> },
) {
  const { "streamer-slug": slug } = await params;
  if (!slug) {
    return NextResponse.json({ error: "missing_slug" }, { status: 400 });
  }

  const url = new URL(request.url);
  const kindParam = (url.searchParams.get("kind") ?? "combined") as LeaderboardKind;
  if (!VALID_KINDS.has(kindParam)) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }
  const limitParam = Number(url.searchParams.get("limit") ?? 10);
  const limit =
    Number.isInteger(limitParam) && limitParam > 0 && limitParam <= 50
      ? limitParam
      : 10;

  // Resolve streamer → community. Two-step lookup mirrors the rest of
  // the live page: gs_communities.slug, falling back to checking the
  // streamer's username/twitch_username. Anonymous streamers without a
  // community row yet return an empty list (200) — the UI handles it.
  const direct = await getCommunityBySlug(slug);
  let communityId: string | null = direct?.id ?? null;
  if (!communityId) {
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
    if (streamer) {
      const fallback =
        ((streamer as { username?: string | null }).username ?? null) ||
        ((streamer as { twitch_username?: string | null }).twitch_username ?? null);
      if (fallback) {
        const c = await getCommunityBySlug(fallback);
        communityId = c?.id ?? null;
      }
    }
  }
  if (!communityId) {
    // No community row yet — treat as empty board, NOT 404. Streamers
    // who haven't had any chat interaction still get a clean rendering.
    return NextResponse.json({ kind: kindParam, rows: [] });
  }

  const rows = await getLeaderboard({
    kind: kindParam,
    communityId,
    limit,
  });
  return NextResponse.json({ kind: kindParam, rows });
}
