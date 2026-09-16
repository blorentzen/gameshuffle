import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getTournamentRole } from "@/lib/tournaments/access-server";
import { broadcastCrewStandings } from "@/lib/tournaments/crewOverlay";

export const runtime = "nodejs";

/**
 * POST /api/tournament/[id]/crew-overlay
 * Organizer/co-organizer only. Recomputes the multi-crew standings and pushes
 * them to the organizer's OBS overlay (persistent event). Called by the manage
 * dashboard whenever results/races change so the crew scoreboard stays live on
 * stream. Best-effort — a streamer who isn't connected just no-ops.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createServiceClient();
  const role = await getTournamentRole(admin, id, user.id);
  if (!role) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  await broadcastCrewStandings(id).catch(() => {});
  return NextResponse.json({ ok: true });
}
