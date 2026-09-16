/** POST /api/communities/[id]/crews/chat { game } — open (get-or-create) the
 *  group chat for a game crew and return its conversation id. Crew members only. */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { openCrewChat } from "@/lib/communities/crews";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { game?: string };
  if (!body.game) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const res = await openCrewChat(user.id, id, body.game);
  if (!res.ok || !res.id) {
    return NextResponse.json({ error: res.reason ?? "failed" }, { status: res.reason === "not_on_crew" ? 403 : 400 });
  }
  return NextResponse.json({ ok: true, id: res.id });
}
