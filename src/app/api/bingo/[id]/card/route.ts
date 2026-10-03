/** POST /api/bingo/[id]/card — deal (or return) the signed-in viewer's card. */

import { NextResponse } from "next/server";
import { getGame, takeCard } from "@/lib/bingo/stream";
import { bingoViewer } from "@/lib/bingo/owner";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await bingoViewer();
  if (!viewer) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const game = await getGame(id);
  if (!game) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const r = await takeCard(game, viewer.userId);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, card: r.value });
}
