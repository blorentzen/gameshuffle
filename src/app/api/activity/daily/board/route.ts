/**
 * GET /api/activity/daily/board?game=&period= — a Daily leaderboard inside the
 * Discord Activity (Bearer session). Same boards as /api/daily/board; "you"
 * is the player's account when their Discord user has one, else their Discord
 * identity.
 */

import { NextResponse } from "next/server";
import { sessionFrom } from "@/lib/activity/session";
import { boardView, playerForIdentity } from "@/lib/daily/boards";
import { BOARD_GAMES, BOARD_PERIODS, playerKey, type BoardGame, type BoardPeriod } from "@/lib/daily/boardRules";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const s = sessionFrom(req);
  if (!s) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const url = new URL(req.url);
  const game = (BOARD_GAMES as string[]).includes(url.searchParams.get("game") ?? "") ? (url.searchParams.get("game") as BoardGame) : "shuffle";
  const period = (BOARD_PERIODS as string[]).includes(url.searchParams.get("period") ?? "") ? (url.searchParams.get("period") as BoardPeriod) : "day";
  const player = await playerForIdentity(s.iid, s.uid);
  const view = await boardView({ game, period, me: playerKey(player.kind, player.id) });
  return NextResponse.json(view, { headers: { "Cache-Control": "private, no-store" } });
}
