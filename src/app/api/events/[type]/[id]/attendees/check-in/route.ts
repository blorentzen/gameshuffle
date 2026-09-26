/**
 * POST /api/events/[type]/[id]/attendees/check-in
 * Body: { attendeeId, checked } | { token, checked? } | { code, checked? }
 * Organizer only. `token` is a scanned ticket; `code` is the typed short code.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EventType } from "@/lib/events/calendar";

function parseType(t: string): EventType | null {
  return t === "tournament" || t === "game-night" ? t : null;
}
import { canManageEvent, listAttendees, setCheckIn, ticketShortCode, ticketToken, verifyTicket } from "@/lib/events/attendees";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type: t, id } = await params;
  const type = parseType(t);
  if (!type) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await canManageEvent(type, id, user?.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { attendeeId?: string; token?: string; code?: string; checked?: boolean };
  const checked = body.checked !== false;
  let attendeeId = body.attendeeId ?? null;

  if (!attendeeId && body.token) {
    const v = verifyTicket(body.token);
    if (!v) return NextResponse.json({ error: "invalid_ticket" }, { status: 400 });
    if (v.type !== type || v.eventId !== id) return NextResponse.json({ error: "wrong_event" }, { status: 400 });
    attendeeId = v.attendeeId;
  }
  if (!attendeeId && body.code) {
    const code = body.code.trim().toUpperCase();
    const all = await listAttendees(type, id);
    const hit = all.find((a) => ticketShortCode(ticketToken(type, id, a.id)) === code);
    if (!hit) return NextResponse.json({ error: "code_not_found" }, { status: 404 });
    attendeeId = hit.id;
  }
  if (!attendeeId) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const res = await setCheckIn(type, id, attendeeId, checked);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.error === "not_found" ? 404 : 409 });
  return NextResponse.json({ ok: true, attendee: res.attendee });
}
