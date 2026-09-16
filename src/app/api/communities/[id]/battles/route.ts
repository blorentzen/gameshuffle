/**
 * Crew battles API. `[id]` = the community acting (home side for POST).
 *   POST  { game, opponentSlug, scheduledAt? }                       — propose
 *   PATCH { battleId, action: 'accept' | 'decline' | 'cancel' }      — respond / cancel
 *   PATCH { battleId, action: 'report', winnerCommunityId, homeScore?, awayScore? } — report result
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { proposeBattle, respondBattle, reportBattle, cancelBattle } from "@/lib/communities/battles";

export const runtime = "nodejs";

async function uid(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function status(reason?: string): number {
  return reason === "forbidden" ? 403 : reason === "not_found" || reason === "opponent_not_found" ? 404 : 400;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await uid();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { game?: string; opponentSlug?: string; scheduledAt?: string };
  if (!b.game || !b.opponentSlug) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const res = await proposeBattle({ actorId: userId, homeCommunityId: id, game: b.game, opponentSlug: b.opponentSlug, scheduledAt: b.scheduledAt });
  if (!res.ok) return NextResponse.json({ error: res.reason ?? "failed" }, { status: status(res.reason) });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const userId = await uid();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as {
    battleId?: string; action?: string; winnerCommunityId?: string; homeScore?: number; awayScore?: number;
  };
  if (!b.battleId || !b.action) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  let res: { ok: boolean; reason?: string };
  if (b.action === "accept") res = await respondBattle(userId, b.battleId, true);
  else if (b.action === "decline") res = await respondBattle(userId, b.battleId, false);
  else if (b.action === "cancel") res = await cancelBattle(userId, b.battleId);
  else if (b.action === "report") {
    if (!b.winnerCommunityId) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    res = await reportBattle({ actorId: userId, battleId: b.battleId, winnerCommunityId: b.winnerCommunityId, homeScore: b.homeScore, awayScore: b.awayScore });
  } else return NextResponse.json({ error: "bad_action" }, { status: 400 });

  if (!res.ok) return NextResponse.json({ error: res.reason ?? "failed" }, { status: status(res.reason) });
  return NextResponse.json({ ok: true });
}
