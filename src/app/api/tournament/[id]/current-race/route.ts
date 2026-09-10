import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { setTournamentCurrentRace, stepTournamentCurrentRace } from "@/lib/tournaments/currentRace";
import { getTournamentRole } from "@/lib/tournaments/access-server";

export const runtime = "nodejs";

/**
 * POST /api/tournament/[id]/current-race
 * Organizer-only. Sets / advances the "current race" pointer and broadcasts it
 * to the organizer's OBS overlay + Twitch chat.
 *   body: { action: "set", key: string | null } | { action: "next" | "prev" }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createServiceClient();
  const role = await getTournamentRole(admin, id, user.id);
  if (!role) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { action?: string; key?: string | null };

  if (body.action === "next" || body.action === "prev") {
    const res = await stepTournamentCurrentRace({ tournamentId: id, dir: body.action === "next" ? 1 : -1 });
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  }
  if (body.action === "set") {
    const res = await setTournamentCurrentRace({ tournamentId: id, key: body.key ?? null });
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
