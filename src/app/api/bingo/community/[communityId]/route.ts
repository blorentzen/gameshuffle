/**
 * GET /api/bingo/community/[communityId] — the community's current Stream Bingo
 * game for /live: { ok, game, myCard }. Public read; myCard only for a signed-in
 * viewer. Also makes the timer's call when one is due (see tickAuto).
 */

import { NextResponse } from "next/server";
import { getCard, getCurrentGame, tickAuto, viewOf } from "@/lib/bingo/stream";
import { bingoViewer } from "@/lib/bingo/owner";

export const runtime = "nodejs";

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params;
  if (!UUID.test(communityId)) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });
  try {
    let game = await getCurrentGame(communityId);
    if (!game) return NextResponse.json({ ok: true, game: null, myCard: null });
    game = await tickAuto(game);
    const viewer = await bingoViewer();
    const myCard = viewer ? await getCard(game.id, viewer.userId) : null;
    return NextResponse.json({ ok: true, game: await viewOf(game), myCard, signedIn: !!viewer });
  } catch (err) {
    console.error("[bingo/community] read failed:", err);
    return NextResponse.json({ ok: true, game: null, myCard: null });
  }
}
