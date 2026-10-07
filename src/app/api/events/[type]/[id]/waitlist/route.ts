/**
 * POST /api/events/[type]/[id]/waitlist — organizer waitlist controls.
 *   { action: "reorder", ids }        set the line order (first in line first)
 *   { action: "offer", attendeeId }   offer a spot to this person (even past the cap)
 *   { action: "seat", attendeeId }    seat them straight in
 *   { action: "withdraw", attendeeId } take an offer back (they keep their place)
 *   { action: "fill" }                offer any free seats to the line now
 *   { action: "cap", cap }            limit the waitlist's length (null = no limit)
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManageEvent } from "@/lib/events/attendees";
import { fillOpenSeats, offerTo, reorder, seatNow, setWaitlistCap, withdrawOffer } from "@/lib/events/waitlist";
import type { EventType } from "@/lib/events/calendar";

export const runtime = "nodejs";

function parseType(t: string): EventType | null {
  return t === "tournament" || t === "game-night" ? t : null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type: t, id } = await params;
  const type = parseType(t);
  if (!type) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await canManageEvent(type, id, user?.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { action?: string; ids?: string[]; attendeeId?: string; cap?: number | null } | null;
  const attendeeId = String(body?.attendeeId ?? "");
  const out = (r: { ok: boolean; error?: string }) => (r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: r.error }, { status: 409 }));
  switch (body?.action) {
    case "reorder":
      if (!Array.isArray(body.ids)) return NextResponse.json({ error: "bad_body" }, { status: 400 });
      return out({ ok: await reorder(type, id, body.ids.map(String).slice(0, 1000)) });
    case "offer": return out(await offerTo(type, id, attendeeId));
    case "seat": return out(await seatNow(type, id, attendeeId));
    case "withdraw": return out(await withdrawOffer(type, id, attendeeId));
    case "cap": return out({ ok: await setWaitlistCap(type, id, typeof body.cap === "number" ? body.cap : null) });
    case "fill": {
      const r = await fillOpenSeats(type, id);
      return NextResponse.json({ ok: true, offered: r.touched.length, standby: r.standby });
    }
    default: return NextResponse.json({ error: "bad_action" }, { status: 400 });
  }
}
