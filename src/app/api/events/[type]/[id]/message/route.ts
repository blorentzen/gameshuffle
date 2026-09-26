/**
 * POST /api/events/[type]/[id]/message → organizer message to attendees.
 * Body: { subject, body, audience: "all" | "going" | "waitlisted" | "checked_in" }
 * Delivers as in-app notifications + email (non-prod logs instead of sending).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EventType } from "@/lib/events/calendar";

function parseType(t: string): EventType | null {
  return t === "tournament" || t === "game-night" ? t : null;
}
import { canManageEvent, messageAttendees, type MessageAudience } from "@/lib/events/attendees";

export const runtime = "nodejs";
const AUDIENCES = new Set<MessageAudience>(["all", "going", "waitlisted", "checked_in"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type: t, id } = await params;
  const type = parseType(t);
  if (!type) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await canManageEvent(type, id, user.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { subject?: string; body?: string; audience?: string; sms?: boolean };
  const subject = (body.subject ?? "").trim();
  const text = (body.body ?? "").trim();
  const audience = AUDIENCES.has(body.audience as MessageAudience) ? (body.audience as MessageAudience) : "all";
  if (subject.length < 2 || text.length < 2) return NextResponse.json({ error: "subject_and_body_required" }, { status: 400 });

  const result = await messageAttendees({ type, eventId: id, senderId: user.id, subject, body: text, audience, sms: body.sms === true });
  return NextResponse.json({ ok: true, ...result });
}
