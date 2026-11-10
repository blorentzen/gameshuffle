/**
 * GET /api/cron/twitch-top (daily at 03:00 UTC: 8pm PDT / 7pm PST, an evening reading in the US)
 *
 * Reads Twitch's 200 biggest games and the viewers on each one's top 100 live streams, and stores them as today's
 * Pacific-day reading (src/lib/platform/twitchTop.ts). Platform ▸ Overview ▸ Setup ▸ Games on Twitch averages the
 * last 30. Taking it twice in a day replaces the first. Before supabase/twitch-top-m1.sql runs it does nothing.
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { takeTwitchReading } from "@/lib/platform/twitchTop";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/twitch-top] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  try {
    const taken = await takeTwitchReading();
    if (!taken.ok) return NextResponse.json({ ok: true, skipped: taken.reason });
    return NextResponse.json(taken);
  } catch (err) {
    console.error("[cron/twitch-top] failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
