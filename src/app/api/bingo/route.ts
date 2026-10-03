/**
 * GET / POST /api/bingo — the streamer's Stream Bingo controls (GS Pro).
 *   GET  → { isPro, hasCommunity, game } (the current game, if any)
 *   POST → open a game. Body: { pattern (a pattern id or "series"), callInterval?, prizeTokens?, prizeText? }
 */

import { NextResponse } from "next/server";
import { bingoOwner } from "@/lib/bingo/owner";
import { getCurrentGame, openGame, tickAuto, viewOf } from "@/lib/bingo/stream";
import type { Pattern } from "@/lib/originals/bingo";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await bingoOwner();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  let game = ctx.communityId ? await getCurrentGame(ctx.communityId) : null;
  if (game) game = await tickAuto(game);
  return NextResponse.json({ ok: true, isPro: ctx.isPro, hasCommunity: !!ctx.communityId, game: game ? await viewOf(game) : null });
}

export async function POST(request: Request) {
  const ctx = await bingoOwner();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  if (!ctx.isPro) return NextResponse.json({ ok: false, error: "pro_required" }, { status: 403 });
  if (!ctx.communityId) return NextResponse.json({ ok: false, error: "no_community" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { pattern?: string; callInterval?: number | null; prizeTokens?: number; prizeText?: string | null } | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  const r = await openGame({
    communityId: ctx.communityId,
    createdBy: ctx.userId,
    pattern: (body.pattern ?? "line") as Pattern | "series",
    callInterval: typeof body.callInterval === "number" ? body.callInterval : null,
    prizeTokens: typeof body.prizeTokens === "number" ? body.prizeTokens : 0,
    prizeText: typeof body.prizeText === "string" ? body.prizeText : null,
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, game: await viewOf(r.value) });
}
