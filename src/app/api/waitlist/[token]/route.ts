/**
 * GET  /api/waitlist/[token] → the offer behind a signed link (from the offer email)
 * POST /api/waitlist/[token] → { action: "claim" | "pass" | "leave" }
 *
 * Works without an account, so guests on a tournament waitlist can claim. The
 * link only says who; whether there's still an offer is read fresh every time.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getEventMeta, verifyOfferToken } from "@/lib/events/attendees";
import { claim, leave, myWaitlist, pass } from "@/lib/events/waitlist";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = verifyOfferToken(token);
  if (!v) return NextResponse.json({ error: "bad_link" }, { status: 404 });
  const [meta, me] = await Promise.all([getEventMeta(v.type, v.eventId), myWaitlist(v.type, v.eventId, v.attendeeId)]);
  if (!meta || !me) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, event: { type: v.type, id: v.eventId, title: meta.title, startsAt: meta.startsAt, href: meta.href }, me });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = verifyOfferToken(token);
  if (!v) return NextResponse.json({ error: "bad_link" }, { status: 404 });
  const { ok: under } = await rateLimit(`waitlist-link:${v.attendeeId}`, { max: 20, windowMs: 60_000 });
  if (!under) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  const act = body?.action === "claim" ? claim : body?.action === "pass" ? pass : body?.action === "leave" ? leave : null;
  if (!act) return NextResponse.json({ error: "bad_action" }, { status: 400 });
  const r = await act(v.type, v.eventId, v.attendeeId);
  const me = await myWaitlist(v.type, v.eventId, v.attendeeId);
  if (!r.ok && r.error === "pay") return NextResponse.json({ ok: false, pay: true, me });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error, me }, { status: 409 });
  return NextResponse.json({ ok: true, me });
}
