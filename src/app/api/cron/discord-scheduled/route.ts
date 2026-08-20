/**
 * GET /api/cron/discord-scheduled
 *
 * Fires due scheduled Discord posts (announcements + follow-ups). Runs every
 * minute so scheduled times land promptly. Auth: Vercel Cron Bearer CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { fireDueScheduledPosts } from "@/lib/discord/scheduled";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/discord-scheduled] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  try {
    const result = await fireDueScheduledPosts();
    if (result.sent || result.failed) console.log("[cron/discord-scheduled]", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/discord-scheduled] failed:", err);
    return NextResponse.json({ error: "sweep failed" }, { status: 500 });
  }
}
