/**
 * POST /api/game-nights/[id]/rsvp → set the signed-in user's RSVP.
 * Body: { status: "going" | "maybe" | "declined" }.
 *
 * Capacity-aware through the waitlist engine (src/lib/events/waitlist.ts): a
 * "going" on a full night (or one with people already waiting) joins the
 * waitlist; a "going" while holding an offer claims it; paid nights seat
 * through tickets only. Giving up a seat (or an offer) passes it to the next
 * person. The response carries the status actually stored.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getEventMeta, listAttendees } from "@/lib/events/attendees";
import { claim, fillOpenSeats, joinDecision, joinWaitlist } from "@/lib/events/waitlist";
import type { RsvpStatus } from "@/lib/game-nights/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in to RSVP." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { status?: string };
  const wanted: RsvpStatus = body.status === "maybe" ? "maybe" : body.status === "declined" ? "declined" : "going";

  const meta = await getEventMeta("game-night", id);
  if (!meta) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const mine = (await listAttendees("game-night", id)).find((a) => a.userId === user.id);
  const svc = createServiceClient();

  if (wanted === "going") {
    if (mine?.status === "going") return NextResponse.json({ ok: true, status: "going" });
    if (mine?.status === "waitlisted") return NextResponse.json({ ok: true, status: "waitlisted" });
    if (mine?.status === "offered") {
      const r = await claim("game-night", id, mine.id);
      if (r.ok) return NextResponse.json({ ok: true, status: "going" });
      if (r.error === "pay") return NextResponse.json({ ok: false, pay: true, status: "offered" }, { status: 409 });
      return NextResponse.json({ error: r.error === "offer_expired" ? "That offer ran out and went to the next person. You're still on the waitlist." : "That spot is gone. You're still on the waitlist." }, { status: 409 });
    }
    const decision = await joinDecision("game-night", id);
    if (decision === "paid") return NextResponse.json({ error: "This night sells tickets. Get one below to save your spot.", paid: true }, { status: 409 });
    if (decision === "waitlist_full") return NextResponse.json({ error: "This night is full and so is its waitlist." }, { status: 409 });
    if (decision === "waitlist") {
      const r = await joinWaitlist("game-night", id, { userId: user.id, displayName: "" });
      if (!r.ok && r.error !== "already_in") return NextResponse.json({ error: "This night is full." }, { status: 409 });
      const now = (await listAttendees("game-night", id)).find((a) => a.userId === user.id);
      return NextResponse.json({ ok: true, status: now?.status ?? "waitlisted" });
    }
    const { error } = await svc.from("board_game_night_rsvps")
      .upsert({ night_id: id, user_id: user.id, status: "going", waitlisted_at: null }, { onConflict: "night_id,user_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, status: "going" });
  }

  // maybe / declined: giving up a seat or an offer passes it on.
  const { error } = await svc.from("board_game_night_rsvps")
    .upsert({ night_id: id, user_id: user.id, status: wanted, waitlisted_at: null }, { onConflict: "night_id,user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  let promoted: string | null = null;
  if (mine?.status === "going" || mine?.status === "offered") {
    const r = await fillOpenSeats("game-night", id).catch(() => null);
    promoted = r?.touched[0]?.displayName ?? null;
  }
  return NextResponse.json({ ok: true, status: wanted, promoted });
}
