/**
 * GET /api/cron/space-challenges
 *
 * Pays the places of the game spaces' time trial challenges (src/lib/spaces/spaceTt.ts): the time trial of the day's
 * top three and the Combo Cup's top three, two days after each day or week closes, among verified times only. Each
 * place pays once, so running it again (or twice a day) changes nothing. Daily, 17:00 UTC (9 or 10am Pacific).
 * Auth: Vercel Cron Bearer CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { GAME_SPACES } from "@/lib/games/spaces";
import { settleSpaceTt } from "@/lib/spaces/spaceTt";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/space-challenges] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }
  const r = await settleSpaceTt(GAME_SPACES).catch((err) => {
    console.error("[cron/space-challenges] settle failed:", err);
    return { paid: -1 };
  });
  return NextResponse.json({ ok: r.paid >= 0, paid: r.paid });
}
