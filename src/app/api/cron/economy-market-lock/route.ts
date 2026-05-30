/**
 * GET /api/cron/economy-market-lock
 *
 * Sweeps prediction markets whose `lock_at` backstop has passed and
 * flips them `open → locked`. Per Spec 02 §3.4 — every market has a
 * timer (1/3/5 min) that fires unless a host runs `!gs-market-lock`
 * first; this sweep is the timer.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 *
 * Schedule (vercel.json): every minute. The minimum supported lock
 * window is 1 minute, so a per-minute cron is the right granularity.
 * `lockExpiredMarkets` runs as a single UPDATE so the per-tick cost
 * is one query regardless of how many markets are open.
 */

import { NextResponse } from "next/server";
import { lockExpiredMarkets } from "@/lib/economy/markets/lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/economy-market-lock] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const startedAt = Date.now();
  try {
    const locked = await lockExpiredMarkets();
    const durationMs = Date.now() - startedAt;
    console.log("[cron/economy-market-lock]", {
      durationMs,
      locked: locked.length,
    });
    return NextResponse.json({
      ok: true,
      durationMs,
      locked: locked.length,
      markets: locked.map((m) => ({ id: m.id, sessionId: m.session_id })),
    });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    console.error("[cron/economy-market-lock] sweep threw", { durationMs, err });
    return NextResponse.json(
      {
        error: "sweep_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
