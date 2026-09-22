/** POST /api/events/[type]/[id]/ticketing → refund policy + fee payer (organizer only). */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EventType } from "@/lib/events/calendar";

function parseType(t: string): EventType | null { return t === "tournament" || t === "game-night" ? t : null; }
import { getTicketing, setTicketing } from "@/lib/events/tickets";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type: t, id } = await params;
  const type = parseType(t);
  if (!type) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ticketing: await getTicketing(type, id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type: t, id } = await params;
  const type = parseType(t);
  if (!type) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (body.refundPolicy === "none" || body.refundPolicy === "until_days_before" || body.refundPolicy === "always") patch.refundPolicy = body.refundPolicy;
  if (typeof body.refundDaysBefore === "number") patch.refundDaysBefore = Math.max(0, Math.min(90, Math.round(body.refundDaysBefore)));
  if (body.feePayer === "buyer" || body.feePayer === "organizer") patch.feePayer = body.feePayer;
  try {
    await setTicketing({ type, eventId: id, actorId: user.id, ticketing: patch });
    return NextResponse.json({ ok: true, ticketing: await getTicketing(type, id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 403 });
  }
}
