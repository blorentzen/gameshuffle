/**
 * POST /api/tournament/[id]/geocode → geocode the tournament's in-person
 * location text into `tournaments.lat/lng` so it can join near-me sorting on
 * the events browser. Organizer / co-organizer only. Fire-and-forget from the
 * manage page after a location save; idempotent; clears coords for online.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { geocodePlace } from "@/lib/game-nights/geocode";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createServiceClient();
  const { data: t } = await admin.from("tournaments").select("id, organizer_id, settings").eq("id", id).maybeSingle();
  if (!t) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (t.organizer_id !== user.id) {
    const { data: co } = await admin.from("tournament_organizers").select("user_id").eq("tournament_id", id).eq("user_id", user.id).maybeSingle();
    if (!co) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const settings = (t.settings ?? {}) as { locationType?: string; location?: string | null };
  const coords = settings.locationType === "in_person" ? await geocodePlace(settings.location) : null;
  const { error } = await admin.from("tournaments").update({ lat: coords?.lat ?? null, lng: coords?.lng ?? null }).eq("id", id);
  if (error) {
    // Pre-migration (no lat/lng columns) — not an error worth surfacing to the organizer.
    return NextResponse.json({ ok: false, reason: "not_available" });
  }
  return NextResponse.json({ ok: true, coords });
}
