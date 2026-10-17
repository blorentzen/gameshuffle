/**
 * GET /api/daily/board?game=shuffle|dex&period=day|week|month — a Daily
 * leaderboard (src/lib/daily/boards.ts) with the viewer's own row: the
 * signed-in account, else the guest whose browser id comes in x-daily-guest.
 * `ready: false` until supabase/daily-boards-m1.sql has run.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { boardView } from "@/lib/daily/boards";
import { guestKey, validGuestSecret } from "@/lib/daily/guests";
import { BOARD_GAMES, BOARD_PERIODS, type BoardGame, type BoardPeriod } from "@/lib/daily/boardRules";
import { dayKey } from "@/lib/originals/daily";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const game = (BOARD_GAMES as string[]).includes(url.searchParams.get("game") ?? "") ? (url.searchParams.get("game") as BoardGame) : "shuffle";
  const period = (BOARD_PERIODS as string[]).includes(url.searchParams.get("period") ?? "") ? (url.searchParams.get("period") as BoardPeriod) : "day";
  // Dev only: ?day= looks at another day's boards.
  const asked = url.searchParams.get("day");
  const day = process.env.NODE_ENV !== "production" && asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : dayKey();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const secret = req.headers.get("x-daily-guest");
  const me = user ? `u:${user.id}` : validGuestSecret(secret) ? `g:${guestKey(secret)}` : null;

  const view = await boardView({ game, period, day, me });
  return NextResponse.json(view, { headers: { "Cache-Control": "private, no-store" } });
}
