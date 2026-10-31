/**
 * DELETE /api/tournament/[id]/draft
 *
 * Deletes a draft nobody has joined (decided 2026-10-07: drafts are private
 * and deletable). Anything published is archived instead, never deleted, so
 * results and history stay intact. Owner only.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const admin = createServiceClient();
  const { data: t } = await admin.from("tournaments").select("organizer_id, status").eq("id", id).maybeSingle();
  const row = t as { organizer_id: string; status: string } | null;
  if (!row) return NextResponse.json({ ok: false, error: "Tournament not found." }, { status: 404 });
  if (row.organizer_id !== user.id) return NextResponse.json({ ok: false, error: "Only the organizer can delete this draft." }, { status: 403 });
  if (row.status !== "draft") return NextResponse.json({ ok: false, error: "Only drafts can be deleted. Archive a published tournament instead." }, { status: 409 });
  const { count } = await admin.from("tournament_participants").select("id", { count: "exact", head: true }).eq("tournament_id", id);
  if ((count ?? 0) > 0) return NextResponse.json({ ok: false, error: "Someone has already joined this draft. Archive it instead." }, { status: 409 });

  const { error } = await admin.from("tournaments").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: "Couldn't delete it. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
