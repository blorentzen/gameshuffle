/**
 * GET /api/cron/tt-updaters (Mondays): each time trial updater's note for the week, with the clips to check and the
 * reports in their game and items (round 3 pick 8A). Scheduled at 16:00 and 17:00 UTC so it lands at 9am Pacific in
 * both summer and winter; each updater is claimed once per Pacific day, so the second run finds nothing to send.
 * `?force=1` sends again (staff testing). Auth: Vercel Cron Bearer CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { gsHour } from "@/lib/time/gsClock";
import { sendUpdaterDigests } from "@/lib/timeTrials/updaters";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/tt-updaters] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }
  const force = new URL(request.url).searchParams.get("force") === "1";
  // Only the run that lands at 9am Pacific sends (the other offset's run finds the hour wrong and stops).
  if (!force && gsHour() !== 9) return NextResponse.json({ ok: true, skipped: "not 9am Pacific" });
  const res = await sendUpdaterDigests({ force });
  return NextResponse.json({ ok: true, ...res });
}
