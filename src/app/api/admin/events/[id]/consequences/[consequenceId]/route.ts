/**
 * DELETE /api/admin/events/[id]/consequences/[consequenceId]
 *
 * Remove a consequence from an event. Refuses cross-event deletes
 * (the consequence's event_id must match the URL's event id) so a
 * misconfigured client can't accidentally wipe rows on the wrong
 * event.
 *
 * Staff/admin only.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  {
    params,
  }: { params: Promise<{ id: string; consequenceId: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profile as { role: string | null } | null)?.role ?? null;
  if (!isStaffRole(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id: eventId, consequenceId } = await params;
  if (!eventId || !consequenceId) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  // Ownership check before delete — ensures the consequence belongs
  // to the event in the URL.
  const { data: existing } = await admin
    .from("gs_event_consequences")
    .select("id, event_id")
    .eq("id", consequenceId)
    .maybeSingle();
  const row = existing as { id: string; event_id: string } | null;
  if (!row || row.event_id !== eventId) {
    return NextResponse.json(
      { error: "consequence_not_found" },
      { status: 404 },
    );
  }

  const { error } = await admin
    .from("gs_event_consequences")
    .delete()
    .eq("id", consequenceId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
