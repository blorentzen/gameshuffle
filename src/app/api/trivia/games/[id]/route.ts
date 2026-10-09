/**
 * GET   /api/trivia/games/[id] → the night for its host (rounds with answers)
 * PATCH /api/trivia/games/[id] { title?, rounds? } → save the builder (before it starts)
 *       { action: "go_live" } → open the room so teams can join
 *       { action: "cancel" }  → drop a night that hasn't finished
 *       { action: "fill", round? } → fill empty slots from the GameShuffle pack
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { fillFromPack, goLive, saveGame } from "@/lib/trivia/store";
import { triviaHost } from "@/lib/trivia/host";
import type { TriviaRound } from "@/lib/trivia/rules";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await triviaHost(id);
  if (!ctx.ok) return ctx.response;
  const g = ctx.game!;
  return NextResponse.json({ ok: true, game: { id: g.id, title: g.title, code: g.code, status: g.status, template: g.template, rounds: g.rounds, settings: g.settings } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await triviaHost(id);
  if (!ctx.ok) return ctx.response;
  const body = (await request.json().catch(() => null)) as { action?: string; title?: string; rounds?: Partial<TriviaRound>[]; round?: number } | null;
  if (body?.action === "go_live") {
    const r = await goLive(ctx.userId, id);
    return r.ok ? NextResponse.json({ ok: true, code: r.game.code }) : NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  }
  if (body?.action === "fill") {
    const round = Number.isInteger(body.round) ? body.round : undefined;
    const r = await fillFromPack(ctx.userId, id, round);
    return r.ok
      ? NextResponse.json({ ok: true, added: r.added, short: r.short, game: { id: r.game.id, title: r.game.title, rounds: r.game.rounds } })
      : NextResponse.json({ ok: false, error: r.error }, { status: r.error === "pack_empty" ? 409 : 400 });
  }
  if (body?.action === "cancel") {
    const { error } = await createServiceClient().from("trivia_games").update({ status: "cancelled" }).eq("id", id).neq("status", "done");
    return error ? NextResponse.json({ ok: false, error: "failed" }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  const r = await saveGame(ctx.userId, id, { title: body?.title, rounds: body?.rounds });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, game: { id: r.game.id, title: r.game.title, rounds: r.game.rounds } });
}
