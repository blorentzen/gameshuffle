/**
 * PATCH /api/bingo/[id] — the streamer runs their open game (GS Pro).
 *   { action: "call" }                 call the next number
 *   { action: "auto", seconds|null }   timer on (30–600s) or off
 *   { action: "close" }                end it with no winner
 */

import { NextResponse } from "next/server";
import { bingoOwner } from "@/lib/bingo/owner";
import { callNext, closeGame, getGame, setAutoCall, viewOf } from "@/lib/bingo/stream";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await bingoOwner();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  if (!ctx.isPro) return NextResponse.json({ ok: false, error: "pro_required" }, { status: 403 });
  const game = await getGame(id);
  if (!game || game.communityId !== ctx.communityId) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { action?: string; seconds?: number | null } | null;

  if (body?.action === "call") {
    const next = await callNext(game);
    if (!next) return NextResponse.json({ ok: false, error: game.called.length >= 75 ? "all_called" : "not_open" }, { status: 400 });
    return NextResponse.json({ ok: true, game: await viewOf(next) });
  }
  if (body?.action === "auto") {
    const r = await setAutoCall(id, typeof body.seconds === "number" ? body.seconds : null);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, game: await viewOf(r.value) });
  }
  if (body?.action === "close") {
    const r = await closeGame(id);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, game: await viewOf(r.value) });
  }
  return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
}
