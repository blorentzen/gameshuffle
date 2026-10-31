/**
 * GET /api/cron/duel-days
 *
 * The Daily Duel's days: today's and tomorrow's built ahead (and tomorrow's rebuilt when it's on older
 * rules), so midnight and the homepage card never wait on a player. Its own route because a hard day
 * can search for a minute or more on Vercel; inside the every-minute sweep it blocked other work and
 * ran out of time. Every 10 minutes. Auth: Vercel Cron Bearer CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { ensureDays } from "@/lib/originals/duel/store";
import { DUEL_PUBLIC } from "@/lib/games-visibility";

export const runtime = "nodejs";
/** ensureDays searches for up to 240 seconds (store.ts ENSURE_BUDGET_MS). */
export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/duel-days] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }
  if (!DUEL_PUBLIC) return NextResponse.json({ ok: true, built: 0 });
  const t0 = Date.now();
  const built = await ensureDays().catch((err) => {
    console.error("[cron/duel-days] failed:", err);
    return 0;
  });
  if (built) console.log("[cron/duel-days]", { built, durationMs: Date.now() - t0 });
  return NextResponse.json({ ok: true, built });
}
