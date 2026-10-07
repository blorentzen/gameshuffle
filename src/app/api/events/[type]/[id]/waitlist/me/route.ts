/**
 * GET  /api/events/[type]/[id]/waitlist/me → my place in line / my offer
 * POST /api/events/[type]/[id]/waitlist/me → { action: "join" | "claim" | "pass" | "leave" }
 *
 * Signed-in players. Guests use the signed link in their offer email
 * (/api/waitlist/[token]). A claim on a paid event answers { pay: true }: the
 * page then opens checkout, which honours the seat the offer is holding.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { attendeeIdFor, claim, joinWaitlist, leave, myWaitlist, pass } from "@/lib/events/waitlist";
import type { EventType } from "@/lib/events/calendar";

export const runtime = "nodejs";

function parseType(t: string): EventType | null {
  return t === "tournament" || t === "game-night" ? t : null;
}

const MESSAGES: Record<string, string> = {
  waitlist_full: "The waitlist is full.",
  already_in: "You're already signed up.",
  offer_expired: "That offer ran out and went to the next person. You're still on the waitlist.",
  too_late: "Someone else got that spot first. You're still on the waitlist.",
  no_offer: "There's no spot to claim right now.",
  not_waitlisted: "You're not on the waitlist.",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type: t, id } = await params;
  const type = parseType(t);
  if (!type) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const attendeeId = user ? await attendeeIdFor(type, id, user.id) : null;
  const me = await myWaitlist(type, id, attendeeId);
  if (!me) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, me, signedIn: !!user });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type: t, id } = await params;
  const type = parseType(t);
  if (!type) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  const done = async (r: { ok: boolean; error?: string }, attendeeId: string | null) => {
    if (!r.ok && r.error === "pay") return NextResponse.json({ ok: false, pay: true, me: await myWaitlist(type, id, attendeeId) });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error, message: MESSAGES[r.error ?? ""] ?? "That didn't work. Try again.", me: await myWaitlist(type, id, attendeeId) }, { status: 409 });
    return NextResponse.json({ ok: true, me: await myWaitlist(type, id, attendeeId) });
  };
  if (body?.action === "join") {
    const { data: profile } = await createServiceClient().from("users").select("display_name, username").eq("id", user.id).maybeSingle();
    const name = (profile?.display_name as string | null) || (profile?.username as string | null) || "Player";
    const r = await joinWaitlist(type, id, { userId: user.id, displayName: name });
    return done(r, r.ok ? r.attendeeId ?? null : await attendeeIdFor(type, id, user.id));
  }
  const attendeeId = await attendeeIdFor(type, id, user.id);
  if (!attendeeId) return NextResponse.json({ error: "not_waitlisted", message: MESSAGES.not_waitlisted }, { status: 409 });
  if (body?.action === "claim") return done(await claim(type, id, attendeeId), attendeeId);
  if (body?.action === "pass") return done(await pass(type, id, attendeeId), attendeeId);
  if (body?.action === "leave") return done(await leave(type, id, attendeeId), attendeeId);
  return NextResponse.json({ error: "bad_action" }, { status: 400 });
}
