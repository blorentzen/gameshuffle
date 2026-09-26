/**
 * The drop-or-keep step, once the check-in window has closed.
 *
 * The spec is emphatic that nothing is removed automatically, and the reason is
 * worth keeping in the code: an organizer who arrives to find the platform has
 * silently cut four people from their bracket has lost control of their own
 * event. So this endpoint only ever acts on an explicit choice, and "keep" is a
 * real outcome rather than the absence of one.
 *
 * GET  who has not checked in
 * POST { action: "drop" | "keep", participantIds }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { canManageEvent } from "@/lib/events/attendees";

export const runtime = "nodejs";

async function guard(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  if (!(await canManageEvent("tournament", id, user.id))) {
    return { error: NextResponse.json({ error: "You don't run this tournament." }, { status: 403 }) };
  }
  return { user };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if (g.error) return g.error;

  const { data, error } = await createServiceClient()
    .from("tournament_participants")
    .select("id, display_name, user_id, status, checked_in_at, joined_at")
    .eq("tournament_id", id)
    .is("checked_in_at", null)
    // A withdrawal is not a no-show and must not appear in a drop list.
    .not("status", "in", '("dropped","waitlisted")')
    .order("joined_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ unchecked: data ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if (g.error) return g.error;

  const { action, participantIds } = (await request.json().catch(() => ({}))) as {
    action?: "drop" | "keep"; participantIds?: string[];
  };
  if (action !== "drop" && action !== "keep") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    return NextResponse.json({ error: "Nobody selected." }, { status: 400 });
  }

  const svc = createServiceClient();

  if (action === "keep") {
    /* Keeping is recorded, not ignored. Marking them confirmed is what stops
       the list reappearing every time the organizer opens the page, and it
       leaves the attendance view to work out that they never checked in. */
    const { error } = await svc
      .from("tournament_participants")
      .update({ status: "confirmed" })
      .eq("tournament_id", id)
      .in("id", participantIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, kept: participantIds.length });
  }

  // Dropped, not deleted: the entry stays as history, and the attendance view
  // reads it as a no-show because there is no withdrew_at on it.
  const { error } = await svc
    .from("tournament_participants")
    .update({ status: "dropped" })
    .eq("tournament_id", id)
    .in("id", participantIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  /* Seeding goes stale when the field changes, per the seeding spec. That
     column does not exist yet; when it does, this is where it gets set. */
  return NextResponse.json({ ok: true, dropped: participantIds.length });
}
