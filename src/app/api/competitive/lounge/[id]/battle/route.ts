/**
 * POST /api/competitive/lounge/[id]/battle → score a finished crew-battle
 * lounge and write the result back to the battle.
 *
 * Called by the lounge when the organizer completes a set that is bound to a
 * battle. Safe to call more than once: `reportBattle` only accepts a battle
 * still in `accepted`, so a replay is a no-op rather than a second result.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reportBattleFromLounge, scoreBattleLounge } from "@/lib/competitive/battleMatch";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const res = await reportBattleFromLounge(id, user.id);
  if (res.ok) return NextResponse.json({ ok: true, score: res.score });
  // A draw is a real outcome, not a failure: hand back the totals so the UI can
  // ask the captains to settle it.
  if (res.reason === "tie") return NextResponse.json({ ok: false, error: "tie", score: res.score }, { status: 409 });
  return NextResponse.json({ error: res.reason ?? "failed" }, { status: res.reason === "forbidden" ? 403 : 400 });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await scoreBattleLounge(id);
  return res.ok ? NextResponse.json(res) : NextResponse.json({ error: res.reason }, { status: 400 });
}
