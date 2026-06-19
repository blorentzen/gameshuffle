/**
 * DELETE /api/account/custom-commands/[id]
 *
 * Removes a custom command row from the authenticated streamer's
 * community. The community-scoped delete helper unregisters the
 * canonical name from the in-memory registry so the chat trigger
 * stops working within the same tick.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import { deleteCustomCommandById } from "@/lib/twitch/commands/customCommands";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const communityId = await resolveCommunityIdForOwner(user.id);
  if (!communityId) {
    return NextResponse.json({ error: "no_community" }, { status: 404 });
  }
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }
  const result = await deleteCustomCommandById({ communityId, id });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason ?? "delete_failed" },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
