/**
 * PATCH /api/board-game-nights/[id]/community  { communityId: string | null }
 * Posts a night to one of the host's communities (or clears it with null).
 * Host-only; the target community must be one the host belongs to. Degrades to
 * `migration_pending` if the `community_id` column isn't applied yet.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getNight, updateNight } from "@/lib/board-game-nights/store";
import { listCommunitiesForUser } from "@/lib/communities/membership";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const night = await getNight(id);
  if (!night) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (night.host_id !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { communityId?: unknown };
  const communityId = typeof body.communityId === "string" && body.communityId ? body.communityId : null;

  // You can only attach a night to a community you belong to.
  if (communityId) {
    const mine = await listCommunitiesForUser(user.id).catch(() => []);
    if (!mine.some((c) => c.id === communityId)) {
      return NextResponse.json({ error: "not_a_member" }, { status: 403 });
    }
  }

  const res = await updateNight(id, { community_id: communityId });
  if (!res.ok) {
    const missing = /column|community_id|schema cache/i.test(res.error ?? "");
    return NextResponse.json({ error: missing ? "migration_pending" : (res.error ?? "update_failed") }, { status: missing ? 503 : 400 });
  }
  return NextResponse.json({ ok: true, communityId });
}
