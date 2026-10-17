/**
 * GET /api/cron/daily-boards — every day just after midnight Pacific (07:15
 * and 08:15 UTC; one of them is 00:15 Pacific, the other finds nothing to do).
 * Pays the Daily leaderboards' prizes for last week and last month once they
 * settle, two days after they end (src/lib/daily/boards.ts closeDue). Each
 * period is claimed before paying and each payout is keyed, so a rerun pays
 * nothing twice.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 */

import { NextResponse } from "next/server";
import { closeDue } from "@/lib/daily/boards";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/daily-boards] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }
  try {
    const results = await closeDue();
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error("[cron/daily-boards] failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
