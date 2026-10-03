/**
 * POST /api/bingo/[id]/claim — a viewer's Bingo! claim, checked against the
 * numbers called for the game's pattern. The first valid claim wins, the prize
 * is paid, and the win is announced in the streamer's chat.
 */

import { NextResponse } from "next/server";
import { announceToCommunity, claimBingo, getGame, viewOf, winnerMessage } from "@/lib/bingo/stream";
import { bingoViewer } from "@/lib/bingo/owner";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await bingoViewer();
  if (!viewer) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const game = await getGame(id);
  if (!game) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const r = await claimBingo(game, viewer.userId, viewer.name);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error });
  await announceToCommunity(r.game.communityId, winnerMessage(r.game, r.tokens, r.tokenError));
  return NextResponse.json({ ok: true, game: await viewOf(r.game), tokens: r.tokens, tokenError: r.tokenError });
}
