/**
 * GET /api/cron/polls-sweep
 *
 * Closes any open poll whose `closes_at` has passed (the streamer's optional
 * auto-close timer). Runs every minute. Auth: Vercel Cron Bearer CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { sweepDuePolls } from "@/lib/polls/store";
import { sweepStreamWindows } from "@/lib/chatbrain/stream";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/polls-sweep] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const closed = await sweepDuePolls();
  // Chat Brain windows whose time ran out with no chat activity to close them.
  const brainWindows = await sweepStreamWindows().catch((err) => {
    console.error("[cron/polls-sweep] chat brain sweep failed:", err);
    return 0;
  });
  return NextResponse.json({ ok: true, closed, brainWindows });
}
