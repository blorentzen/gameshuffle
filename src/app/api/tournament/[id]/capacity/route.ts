/**
 * POST /api/tournament/[id]/capacity  { max: number | null }
 *
 * Max players after create (approved 2026-10-13). Raising it works like a
 * dropout: the people waiting are offered the new spots in line order (or
 * hear there's room, in the standby stretch before the start). Lowering it
 * never removes anyone; new sign-ups wait until the field is under the new
 * number. Organizers and co-organizers, until the event starts.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { canManageEvent, getEventMeta } from "@/lib/events/attendees";
import { fillOpenSeats } from "@/lib/events/waitlist";

const MAX_FIELD = 1024;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!(await canManageEvent("tournament", id, user.id))) return NextResponse.json({ ok: false, error: "Only the organizers can change this." }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { max?: unknown } | null;
  const raw = body?.max;
  const max = raw === null || raw === "" ? null : Number(raw);
  if (max !== null && (!Number.isInteger(max) || max < 2 || max > MAX_FIELD)) {
    return NextResponse.json({ ok: false, error: `Max players is a whole number from 2 to ${MAX_FIELD}, or no limit.` }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data: t } = await admin.from("tournaments").select("status").eq("id", id).maybeSingle();
  if (!t) return NextResponse.json({ ok: false, error: "Tournament not found." }, { status: 404 });
  const status = (t as { status: string }).status;
  if (status === "in_progress" || status === "complete" || status === "cancelled") {
    return NextResponse.json({ ok: false, error: "The field is set once the event has started." }, { status: 409 });
  }

  const { error } = await admin.from("tournaments").update({ max_participants: max }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: "Couldn't save that. Try again." }, { status: 500 });

  // New room goes to the line first, in order (the same offers a dropout sends).
  const filled = await fillOpenSeats("tournament", id).catch(() => ({ touched: [], standby: false }));
  const meta = await getEventMeta("tournament", id).catch(() => null);
  return NextResponse.json({
    ok: true,
    max,
    offered: filled.touched.length,
    standby: filled.standby,
    // The organizer's Circuit limit when it's lower than what they asked for (billing on).
    planCap: meta?.circuitCap != null && (max == null || meta.circuitCap < max) ? meta.circuitCap : null,
  });
}
