import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getTournamentRole } from "@/lib/tournaments/access-server";
import { canManageTournament } from "@/lib/tournaments/access";
import { notifyYoureUp } from "@/lib/tournaments/youreUp";

export const runtime = "nodejs";

/**
 * POST /api/tournament/[id]/youre-up
 *
 * Pinged by the manage page after it saves a bracket, heat or lobby result.
 * Takes no body on purpose: the server works out which race is now being
 * called, and who is in it, from the database. Organizers only. Idempotent,
 * because every (entrant, race) alert is claimed once.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const role = await getTournamentRole(createServiceClient(), id, user.id);
  if (!canManageTournament(role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const result = await notifyYoureUp(id);
  return NextResponse.json({ ok: true, ...result });
}
