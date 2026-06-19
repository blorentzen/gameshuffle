/**
 * DELETE /api/admin/default-commands/[id]/responses/[responseId]
 *
 * Remove a single pool entry. Refuses cross-command deletes (the
 * response's command_id must match the URL's id) so a misconfigured
 * client can't accidentally wipe a row on the wrong command.
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
  { params }: { params: Promise<{ id: string; responseId: string }> },
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
  const { id: commandId, responseId } = await params;
  if (!commandId || !responseId) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }
  const { data: existing } = await admin
    .from("gs_default_command_responses")
    .select("id, command_id, community_id")
    .eq("id", responseId)
    .maybeSingle();
  const row = existing as
    | { id: string; command_id: string; community_id: string | null }
    | null;
  if (!row || row.command_id !== commandId) {
    return NextResponse.json(
      { error: "response_not_found" },
      { status: 404 },
    );
  }
  // Same wall as the upsert route: admin can only delete platform-
  // default entries. Community-scoped entries are streamer-owned.
  if (row.community_id !== null) {
    return NextResponse.json(
      {
        error:
          "Cannot delete community-scoped response entries from the platform admin — those are streamer-owned.",
      },
      { status: 403 },
    );
  }
  const { error } = await admin
    .from("gs_default_command_responses")
    .delete()
    .eq("id", responseId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
