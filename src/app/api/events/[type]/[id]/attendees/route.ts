/**
 * GET /api/events/[type]/[id]/attendees        → attendee list (organizer only)
 * GET /api/events/[type]/[id]/attendees?csv=1  → the same as a CSV download
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EventType } from "@/lib/events/calendar";

function parseType(t: string): EventType | null {
  return t === "tournament" || t === "game-night" ? t : null;
}
import { attendeesToCsv, canManageEvent, countTaken, getEventMeta, listAttendees } from "@/lib/events/attendees";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type: t, id } = await params;
  const type = parseType(t);
  if (!type) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await canManageEvent(type, id, user?.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [meta, attendees] = await Promise.all([getEventMeta(type, id), listAttendees(type, id)]);
  if (req.nextUrl.searchParams.get("csv")) {
    const slug = (meta?.title ?? "attendees").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 50);
    return new NextResponse(attendeesToCsv(type, attendees), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}-attendees.csv"` },
    });
  }
  return NextResponse.json({ attendees, capacity: meta?.capacity ?? null, taken: countTaken(type, attendees) });
}
