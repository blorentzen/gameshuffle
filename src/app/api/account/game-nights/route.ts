/**
 * GET /api/account/game-nights → the signed-in member's game nights, split into
 * the ones they host and the ones they've RSVP'd to. Powers the "Game Nights"
 * tab under My Stuff. Auth-gated; RLS + host_id scope the reads.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listNightsForHost, listNightsAttending } from "@/lib/board-game-nights/store";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const [hosting, attending] = await Promise.all([
      listNightsForHost(user.id),
      listNightsAttending(user.id),
    ]);
    return NextResponse.json({ ok: true, hosting, attending });
  } catch {
    // Board-game-night tables may not be applied yet — degrade to empty.
    return NextResponse.json({ ok: true, hosting: [], attending: [] });
  }
}
