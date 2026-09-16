/**
 * GET  /api/tournament/[id]/crews?q=<query>
 *      → search communities to add as crews (organizer/co-organizer only).
 * POST /api/tournament/[id]/crews  { participantId, communityId: string | null }
 *      → assign a participant to a crew, or clear it (organizer/co-organizer).
 *
 * Organizer-side multi-crew management: unlike the self-rep flow
 * (`/represent`), the organizer may bucket ANY participant into ANY community
 * (they run the event). Each assign re-broadcasts the crew scoreboard to the
 * organizer's overlay. See `supabase/tournament-crews-m1.sql`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getTournamentRole } from "@/lib/tournaments/access-server";
import { broadcastCrewStandings } from "@/lib/tournaments/crewOverlay";

export const runtime = "nodejs";

async function gate(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };
  const admin = createServiceClient();
  const role = await getTournamentRole(admin, id, user.id);
  if (!role) return { ok: false as const, status: 403 };
  return { ok: true as const, admin, user };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(id);
  if (!g.ok) return NextResponse.json({ error: "forbidden", results: [] }, { status: g.status });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  // Match handle or display name. Escape LIKE wildcards in the user's input.
  const safe = q.replace(/[%_,]/g, "");
  const { data } = await g.admin
    .from("gs_communities")
    .select("id, slug, display_name")
    .or(`slug.ilike.%${safe}%,display_name.ilike.%${safe}%`)
    .limit(8);
  const results = ((data ?? []) as Array<{ id: string; slug: string; display_name: string | null }>).map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.display_name || `@${c.slug}`,
  }));
  return NextResponse.json({ results });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(id);
  if (!g.ok) return NextResponse.json({ error: "forbidden" }, { status: g.status });

  const body = await req.json().catch(() => ({}));
  const participantId = body?.participantId ? String(body.participantId) : "";
  const communityId = body?.communityId ? String(body.communityId) : null;
  if (!participantId) return NextResponse.json({ error: "missing_participant" }, { status: 400 });

  const { error } = await g.admin
    .from("tournament_participants")
    .update({ community_id: communityId })
    .eq("tournament_id", id)
    .eq("id", participantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Keep the overlay scoreboard in sync with the new assignment.
  await broadcastCrewStandings(id).catch(() => {});
  return NextResponse.json({ ok: true });
}
