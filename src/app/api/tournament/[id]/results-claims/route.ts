import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getTournamentRole } from "@/lib/tournaments/access-server";
import { canManageTournament } from "@/lib/tournaments/access";
import { sendResultsClaims } from "@/lib/tournaments/claims";

export const runtime = "nodejs";

/**
 * POST /api/tournament/[id]/results-claims
 *
 * Pinged by the manage page when the tournament is marked complete. Emails each
 * unclaimed guest a fresh claim link for their results. No body: the server
 * decides who qualifies. Organizers only; at most once a day per guest.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const role = await getTournamentRole(createServiceClient(), id, user.id);
  if (!canManageTournament(role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true, ...(await sendResultsClaims(id)) });
}
