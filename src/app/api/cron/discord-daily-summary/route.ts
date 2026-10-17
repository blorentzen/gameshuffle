/**
 * GET /api/cron/discord-daily-summary: 9am Pacific, yesterday's Daily
 * results in every server channel that had a results card (the Discord
 * Activity), with the channel's streak and buttons for today's Daily and the
 * Weekly. Scheduled at 16:00 and 17:00 UTC; only the run that lands on 9am
 * Pacific posts (`?force` overrides). Each card is claimed before posting, so
 * a retried run can't post twice. See src/lib/activity/channelCard.ts.
 * The same run sends yesterday's top 5 their "you made the top 5" note
 * (notifyDailyWinners, src/lib/daily/winners.ts; claimed per game and day).
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 */

import { NextResponse } from "next/server";
import { postDailySummaries } from "@/lib/activity/channelCard";
import { notifyDailyWinners } from "@/lib/daily/winners";
import { gsAddDays, gsDay, gsHour } from "@/lib/time/gsClock";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/discord-daily-summary] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }
  if (gsHour() !== 9 && !new URL(request.url).searchParams.has("force")) {
    return NextResponse.json({ ok: true, posted: 0, note: "not_9am_pacific" });
  }
  // Winner notes don't depend on Discord: they go out even if the posts fail.
  const notes = await notifyDailyWinners(gsAddDays(gsDay(), -1)).catch((err) => { console.error("[cron/discord-daily-summary] winner notes failed:", err); return 0; });
  try {
    return NextResponse.json({ ok: true, posted: await postDailySummaries(), notes });
  } catch (err) {
    console.error("[cron/discord-daily-summary] failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
