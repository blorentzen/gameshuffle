/**
 * GET /api/game-nights/[id]/live
 *   → { ok, count, going: [...], night: { title, starts_at, timezone, place,
 *        genres, level, cover_image_url, games } | null }
 * A small public snapshot for the event page + display mode's live updates
 * (paid hosts). Service client so it reads regardless of the viewer's RLS; only
 * public fields. Draft nights return going/count only (no unpublished content).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createServiceClient();

  const [{ data: rsvps }, { data: nightRow }] = await Promise.all([
    admin.from("board_game_night_rsvps").select("user_id").eq("night_id", id).eq("status", "going"),
    admin.from("board_game_nights").select("title, starts_at, timezone, place, genres, level, cover_image_url, games, status, visibility").eq("id", id).maybeSingle(),
  ]);

  const ids = (rsvps ?? []).map((r) => (r as { user_id: string }).user_id).slice(0, 60);
  const { data: users } = ids.length
    ? await admin.from("users").select("id, username, display_name, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar").in("id", ids)
    : { data: [] };

  // Only expose night content for a published (non-draft) night.
  const n = nightRow as Record<string, unknown> | null;
  const publishable = n && n.status !== "draft";
  const night = publishable
    ? {
        title: n.title, starts_at: n.starts_at, timezone: n.timezone, place: n.place,
        genres: n.genres, level: n.level, cover_image_url: n.cover_image_url, games: n.games,
      }
    : null;

  return NextResponse.json({ ok: true, count: ids.length, going: users ?? [], night });
}
