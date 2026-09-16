/**
 * GET /api/cron/board-game-series
 *
 * Rolls recurring board-game-night series forward: materializes the next
 * instance for each active series once its current upcoming night has passed.
 * Run daily. Auth: Vercel Cron Bearer CRON_SECRET (same pattern as the other
 * cron sweeps).
 */
import { NextResponse } from "next/server";
import { sweepSeries } from "@/lib/board-game-nights/series";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/board-game-series] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const { created } = await sweepSeries();
  return NextResponse.json({ ok: true, created });
}
