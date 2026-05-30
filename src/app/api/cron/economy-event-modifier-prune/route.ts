/**
 * GET /api/cron/economy-event-modifier-prune
 *
 * Trims older-than-7d expired modifiers from `gs_event_modifiers`.
 * The active query already filters expired rows out, so the cron is
 * purely housekeeping.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 * Schedule (vercel.json): once a day, post-bust-recovery.
 */

import { NextResponse } from "next/server";
import { pruneExpiredModifiers } from "@/lib/economy/events/engine";

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
    console.error("[cron/economy-event-modifier-prune] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  try {
    const result = await pruneExpiredModifiers();
    console.log("[cron/economy-event-modifier-prune]", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/economy-event-modifier-prune] threw", err);
    return NextResponse.json(
      {
        error: "prune_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
