/**
 * GET  /api/tournament/[id]/represent → the signed-in player's crew communities
 *      (the ones they can represent) + which one they're currently repping here.
 * POST /api/tournament/[id]/represent  { communityId: string | null }
 *      → set (or clear) the crew the caller represents in this tournament.
 *
 * Multi-crew tournaments: a participant may REPRESENT one of the communities
 * whose crew they're on, and standings then roll up per crew (community). The
 * caller must already be a participant, and may only pick a community they
 * actually crew for. Nullable — clearing goes back to solo. See
 * `supabase/tournament-crews-m1.sql`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getUserCrews } from "@/lib/communities/crews";

export const runtime = "nodejs";

/** Distinct communities the user crews for (any game), for the rep picker. */
async function crewCommunities(userId: string) {
  const crews = await getUserCrews(userId).catch(() => []);
  const byId = new Map<string, { id: string; slug: string; name: string }>();
  for (const c of crews) {
    if (!byId.has(c.communityId)) {
      byId.set(c.communityId, { id: c.communityId, slug: c.communitySlug, name: c.communityName });
    }
  }
  return [...byId.values()];
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ communities: [], current: null });

  // Guarded read — pre-migration the community_id column may not exist yet, so a
  // failed select just degrades to "no current rep" rather than throwing.
  const admin = createServiceClient();
  const { data: part } = await admin
    .from("tournament_participants")
    .select("community_id")
    .eq("tournament_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    communities: await crewCommunities(user.id),
    current: (part as { community_id: string | null } | null)?.community_id ?? null,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const communityId = body?.communityId ? String(body.communityId) : null;

  // May only represent a community they actually crew for (or clear to solo).
  if (communityId) {
    const allowed = await crewCommunities(user.id);
    if (!allowed.some((c) => c.id === communityId)) {
      return NextResponse.json({ error: "not_on_crew" }, { status: 403 });
    }
  }

  const admin = createServiceClient();
  const { error } = await admin
    .from("tournament_participants")
    .update({ community_id: communityId })
    .eq("tournament_id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, current: communityId });
}
