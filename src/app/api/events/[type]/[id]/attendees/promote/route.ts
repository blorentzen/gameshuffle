/**
 * POST /api/events/[type]/[id]/attendees/promote → move the longest-waiting
 * attendee off the waitlist if a seat is free (organizer only). Called by the
 * manage pages after a drop / removal; the RSVP route promotes automatically.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EventType } from "@/lib/events/calendar";

function parseType(t: string): EventType | null {
  return t === "tournament" || t === "game-night" ? t : null;
}
import { canManageEvent, promoteFromWaitlist } from "@/lib/events/attendees";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type: t, id } = await params;
  const type = parseType(t);
  if (!type) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await canManageEvent(type, id, user?.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const promoted = await promoteFromWaitlist(type, id);
  return NextResponse.json({ ok: true, promoted });
}
