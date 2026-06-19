/**
 * GET /api/cron/economy-market-lock
 *
 * Per-minute prediction-market timing sweep. Three responsibilities,
 * all idempotent:
 *
 *   1. Auto-lock expired markets (`lockExpiredMarkets`) — flips
 *      `open → locked` when the streamer didn't manually lock first.
 *      Posts a chat broadcast for each one that auto-locks this
 *      tick (host-initiated locks broadcast inline from
 *      `handleMarketLockCommand`).
 *
 *   2. Fire the "closing in <60s" warning for markets whose timer
 *      is within the next minute. `notifications.lock_60s` stamps
 *      the row at claim time so the warning lands once per market.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 * Schedule (vercel.json): every minute.
 */

import { NextResponse } from "next/server";
import {
  claimMarketForAutoLockBroadcast,
  claimMarketsForClosingSoonWarning,
  lockExpiredMarkets,
} from "@/lib/economy/markets/lifecycle";
import {
  broadcastAutoLocked,
  broadcastClosingSoon,
} from "@/lib/economy/markets/broadcasts";

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
    // 1. Closing-soon warnings — fire BEFORE the lock sweep so a
    // market that's about to flip locked this same tick still gets
    // its warning. (Markets within 60s of lock_at AND still open.)
    const warned = await claimMarketsForClosingSoonWarning();
    for (const m of warned) {
      await broadcastClosingSoon(m);
    }

    // 2. Auto-lock expired markets.
    const locked = await lockExpiredMarkets();

    // 3. Post the auto-lock chat broadcast for each one whose
    // marker hasn't been claimed yet (defense against double-broadcast
    // if the cron retries).
    let autoLockBroadcasts = 0;
    for (const m of locked) {
      const claimed = await claimMarketForAutoLockBroadcast(m.id);
      if (claimed) {
        await broadcastAutoLocked(m);
        autoLockBroadcasts++;
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log("[cron/economy-market-lock]", {
      durationMs,
      warned: warned.length,
      locked: locked.length,
      autoLockBroadcasts,
    });
    return NextResponse.json({
      ok: true,
      durationMs,
      warned: warned.length,
      locked: locked.length,
      autoLockBroadcasts,
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
