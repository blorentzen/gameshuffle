/**
 * Self check-in and self withdrawal for an entrant.
 *
 * The organizer's door scanner already exists and goes through setCheckIn().
 * This is the other half: the entrant doing it themselves, from the tournament
 * page or a reminder link, which is what makes a check-in window worth having.
 *
 * The window is enforced HERE, not only in the UI. A stale page, a bookmarked
 * reminder link or a direct POST must not be able to check someone in after the
 * draw has been made.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkInWindow } from "@/lib/events/checkInWindow";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { action } = (await request.json().catch(() => ({}))) as { action?: "check_in" | "withdraw" };
  if (action !== "check_in" && action !== "withdraw") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const svc = createServiceClient();
  const { data: t } = await svc
    .from("tournaments")
    .select("id, status, date_time, check_in_enabled, check_in_opens_minutes")
    .eq("id", id)
    .maybeSingle();
  if (!t) return NextResponse.json({ error: "Tournament not found." }, { status: 404 });

  const { data: me } = await svc
    .from("tournament_participants")
    .select("id, status")
    .eq("tournament_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me) return NextResponse.json({ error: "You are not entered in this tournament." }, { status: 403 });

  if (action === "withdraw") {
    /* Withdrawing is allowed right up to the start. It is the behaviour we want
       from someone who cannot make it, so it stays easy, and it is recorded
       separately from a no-show. */
    if (t.status !== "open") {
      return NextResponse.json({ error: "This tournament has already started." }, { status: 409 });
    }
    const { error } = await svc
      .from("tournament_participants")
      .update({ status: "dropped", withdrew_at: new Date().toISOString() })
      .eq("id", me.id);
    // withdrew_at arrives with tournament-checkin-window-m1; still drop without it.
    if (error) {
      const { error: fallback } = await svc
        .from("tournament_participants").update({ status: "dropped" }).eq("id", me.id);
      if (fallback) return NextResponse.json({ error: fallback.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, status: "withdrew" });
  }

  const w = checkInWindow({
    enabled: (t as { check_in_enabled?: boolean }).check_in_enabled,
    opensMinutes: (t as { check_in_opens_minutes?: number }).check_in_opens_minutes,
    startsAt: t.date_time,
  });
  if (!w.canCheckIn) {
    const why = w.phase === "before" ? "Check-in has not opened yet."
      : w.phase === "closed" ? "Check-in has closed."
      : "Check-in is not being used for this tournament.";
    return NextResponse.json({ error: why, phase: w.phase }, { status: 409 });
  }

  const { error } = await svc
    .from("tournament_participants")
    .update({ status: "checked_in", checked_in_at: new Date().toISOString() })
    .eq("id", me.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, status: "checked_in" });
}
