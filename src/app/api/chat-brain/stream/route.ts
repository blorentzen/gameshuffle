/**
 * /api/chat-brain/stream: the streamer's Chat Brain game on stream (GS Pro).
 *   GET   → { isPro, hasCommunity, hasTwitch, ready, boards, game } (game = the running or just-finished one)
 *   POST  → start a game of Chat plays: { boards?, seconds?, familySafe? }
 *   PATCH → host controls on the running game: { action: lock | next | time | accept | reject | end, seconds?, answer? }
 * Chat has the same controls (!cb start / next / lock / accept / reject / end).
 */

import { NextResponse } from "next/server";
import { bingoOwner as streamOwner } from "@/lib/bingo/owner";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  StreamGamesNotReady,
  endGame,
  gameView,
  getRunningGame,
  getShowableGame,
  lockWindow,
  nextBoard,
  overrule,
  playableBoards,
  setGuessTime,
  startGame,
  tickGame,
} from "@/lib/chatbrain/streamGame";

export const runtime = "nodejs";

async function broadcasterFor(userId: string): Promise<string | null> {
  const { data } = await createServiceClient().from("twitch_connections").select("twitch_user_id").eq("user_id", userId).maybeSingle();
  return (data?.twitch_user_id as string | null) ?? null;
}

export async function GET() {
  const ctx = await streamOwner();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const hasTwitch = !!(await broadcasterFor(ctx.userId));
  const base = { ok: true, isPro: ctx.isPro, hasCommunity: !!ctx.communityId, hasTwitch };
  if (!ctx.communityId) return NextResponse.json({ ...base, ready: true, boards: { familySafe: 0, all: 0 }, game: null });
  try {
    const [safe, all, showable] = await Promise.all([
      playableBoards(ctx.communityId, true),
      playableBoards(ctx.communityId, false),
      getShowableGame(ctx.communityId),
    ]);
    const game = showable ? await gameView(await tickGame(showable)) : null;
    return NextResponse.json({ ...base, ready: true, boards: { familySafe: safe.length, all: all.length }, game });
  } catch (err) {
    if (err instanceof StreamGamesNotReady) return NextResponse.json({ ...base, ready: false, boards: { familySafe: 0, all: 0 }, game: null });
    throw err;
  }
}

export async function POST(request: Request) {
  const ctx = await streamOwner();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  if (!ctx.isPro) return NextResponse.json({ ok: false, error: "pro_required" }, { status: 403 });
  if (!ctx.communityId) return NextResponse.json({ ok: false, error: "no_community" }, { status: 400 });
  const broadcasterId = await broadcasterFor(ctx.userId);
  if (!broadcasterId) return NextResponse.json({ ok: false, error: "no_twitch" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { boards?: number; seconds?: number; familySafe?: boolean } | null;
  const r = await startGame({
    communityId: ctx.communityId, hostUserId: ctx.userId, broadcasterId,
    boards: Number(body?.boards) || undefined, seconds: Number(body?.seconds) || undefined, familySafe: body?.familySafe !== false,
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.error === "not_ready" ? 503 : 400 });
  return NextResponse.json({ ok: true, game: await gameView(r.game) });
}

export async function PATCH(request: Request) {
  const ctx = await streamOwner();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  if (!ctx.communityId) return NextResponse.json({ ok: false, error: "no_community" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { action?: string; seconds?: number; answer?: string } | null;
  const game = await getRunningGame(ctx.communityId);
  if (!game) return NextResponse.json({ ok: false, error: "no_game" }, { status: 404 });
  const action = body?.action;
  const r = action === "lock" ? await lockWindow(game.id)
    : action === "next" ? await nextBoard(game.id)
    : action === "time" ? await setGuessTime(game.id, Number(body?.seconds))
    : action === "accept" || action === "reject" ? await overrule(game.id, action, body?.answer?.toString().slice(0, 40) || undefined)
    : action === "end" ? await endGame(game.id)
    : { ok: false as const, error: "bad_action" };
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  const after = await getShowableGame(ctx.communityId);
  return NextResponse.json({ ok: true, game: after ? await gameView(after) : null });
}
