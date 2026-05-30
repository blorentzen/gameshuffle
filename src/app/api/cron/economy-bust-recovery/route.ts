/**
 * GET /api/cron/economy-bust-recovery
 *
 * Daily faucet for token-economy identities whose balance has dropped
 * below the bust floor. Calls the `gs_bust_recovery` PL/pgSQL helper,
 * which is idempotent per UTC day — re-runs in the same day grant
 * zero. Per Spec 01 §3.6.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 * Reject anything without it so the route can't be triggered by hand.
 *
 * Schedule (vercel.json): once per day, early UTC morning. Idempotence
 * means a missed tick or accidental double-run is harmless; the choice
 * is just about latency to the first viewer who opens chat the next
 * day with a busted balance.
 */

import { NextResponse } from "next/server";
import { runBustRecovery } from "@/lib/economy/tokens";

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
    console.error("[cron/economy-bust-recovery] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const startedAt = Date.now();
  try {
    const result = await runBustRecovery();
    const durationMs = Date.now() - startedAt;
    console.log("[cron/economy-bust-recovery]", { durationMs, ...result });
    return NextResponse.json({ ok: true, durationMs, ...result });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    console.error("[cron/economy-bust-recovery] sweep threw", { durationMs, err });
    return NextResponse.json(
      {
        error: "sweep_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
