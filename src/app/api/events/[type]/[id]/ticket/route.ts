/**
 * GET /api/events/[type]/[id]/ticket        → the signed-in attendee's ticket
 *                                              { token, code, status }
 * GET /api/events/[type]/[id]/ticket?svg=1  → the QR as an SVG image
 *
 * Tickets are HMAC-signed ids (nothing stored); the organizer's check-in
 * scanner verifies the signature. Only the attendee themselves can fetch it.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EventType } from "@/lib/events/calendar";

function parseType(t: string): EventType | null {
  return t === "tournament" || t === "game-night" ? t : null;
}
import QRCode from "qrcode";
import { canHoldTicket, myAttendee, ticketShortCode, ticketToken } from "@/lib/events/attendees";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type: t, id } = await params;
  const type = parseType(t);
  if (!type) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const me = await myAttendee(type, id, user.id);
  if (!me) return NextResponse.json({ error: "not_attending" }, { status: 404 });

  // A tournament's acceptance mode decides whether `registered` is a seat or
  // still an application, so the eligibility rule needs it. Service client: the
  // viewer may not be able to read the row, and this is one public column.
  let acceptanceMode: string | null = null;
  if (type === "tournament") {
    const { data } = await createServiceClient()
      .from("tournaments").select("acceptance_mode").eq("id", id).maybeSingle();
    acceptanceMode = (data as { acceptance_mode?: string } | null)?.acceptance_mode ?? null;
  }
  if (!canHoldTicket(type, me.status, acceptanceMode)) {
    return NextResponse.json({ error: "not_attending" }, { status: 404 });
  }
  const token = ticketToken(type, id, me.id);

  if (req.nextUrl.searchParams.get("svg")) {
    const svg = await QRCode.toString(token, { type: "svg", errorCorrectionLevel: "M", margin: 1, width: 240 });
    return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=3600" } });
  }
  return NextResponse.json({ token, code: ticketShortCode(token), status: me.status, checkedInAt: me.checkedInAt });
}
