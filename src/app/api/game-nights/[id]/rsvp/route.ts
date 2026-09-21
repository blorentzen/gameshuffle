/**
 * POST /api/game-nights/[id]/rsvp → set the signed-in user's RSVP.
 * Body: { status: "going" | "maybe" | "declined" }.
 *
 * Capacity-aware: a "going" on a full night becomes "waitlisted" (FIFO by
 * waitlisted_at); when someone who held a seat steps back, the longest-waiting
 * attendee is promoted and notified. Response carries the status that was
 * actually stored so the control can say "You're on the waitlist".
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { countTaken, getEventMeta, listAttendees, promoteFromWaitlist } from "@/lib/events/attendees";
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
  const attendees = await listAttendees("game-night", id);
  const mine = attendees.find((a) => a.userId === user.id);
  const heldSeat = mine?.status === "going";

  let status: RsvpStatus = wanted;
  if (wanted === "going" && !heldSeat && meta.capacity != null && countTaken("game-night", attendees) >= meta.capacity) {
    status = "waitlisted";
  }

  const svc = createServiceClient();
  const row: Record<string, unknown> = { night_id: id, user_id: user.id, status };
  if (status === "waitlisted") row.waitlisted_at = mine?.status === "waitlisted" ? undefined : new Date().toISOString();
  else row.waitlisted_at = null;
  let { error } = await svc.from("board_game_night_rsvps").upsert(row, { onConflict: "night_id,user_id" });
  if (error && status === "waitlisted") {
    // Pre-migration (no waitlisted status / column): fall back to a plain "going" rejection.
    return NextResponse.json({ error: "This night is full." }, { status: 409 });
  }
  if (error) {
    delete row.waitlisted_at;
    ({ error } = await svc.from("board_game_night_rsvps").upsert(row, { onConflict: "night_id,user_id" }));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // A held seat was released → promote the next in line.
  let promoted: string | null = null;
  if (heldSeat && status !== "going") {
    const p = await promoteFromWaitlist("game-night", id).catch(() => null);
    promoted = p?.displayName ?? null;
  }
  return NextResponse.json({ ok: true, status, promoted });
}
