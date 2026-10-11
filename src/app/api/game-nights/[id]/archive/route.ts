/**
 * POST /api/game-nights/[id]/archive  { archived: boolean }
 *
 * The host's Archive: an archived night leaves every list and search but
 * still loads by direct link with an "Archived" note. Undo any time. Host only.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { archived?: unknown } | null;
  const archived = body?.archived !== false;

  const admin = createServiceClient();
  const { data: n } = await admin.from("board_game_nights").select("host_id").eq("id", id).maybeSingle();
  if (!n) return NextResponse.json({ ok: false, error: "Night not found." }, { status: 404 });
  if ((n as { host_id: string }).host_id !== user.id) return NextResponse.json({ ok: false, error: "Only the host can archive this night." }, { status: 403 });

  const archivedAt = archived ? new Date().toISOString() : null;
  const { error } = await admin.from("board_game_nights").update({ archived_at: archivedAt }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: "Couldn't save that. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true, archivedAt });
}
