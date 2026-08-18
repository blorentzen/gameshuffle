/**
 * GET /api/cron/mailerlite-sync
 *
 * Daily marketing sync into MailerLite. For every opted-in email:
 *   - refresh the `last_active` field from users.last_seen_at
 *   - add to the Dormant group when inactive > 30d, remove when they return
 *
 * The Dormant group drives the win-back automation; keeping membership
 * accurate here means active returnees stop getting nagged.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Inert (no-op)
 * unless MAILERLITE_API_KEY is set, so it's safe to schedule before go-live.
 *
 * Schedule: see `vercel.json` — once per day.
 */

import { NextResponse } from "next/server";
import { isMailerLiteConfigured, runActivityAndDormancySweep } from "@/lib/marketing/mailerlite";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/mailerlite-sync] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  if (!isMailerLiteConfigured()) {
    return NextResponse.json({ skipped: "mailerlite not configured" });
  }

  try {
    const result = await runActivityAndDormancySweep();
    console.log("[cron/mailerlite-sync]", result);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[cron/mailerlite-sync] sweep failed:", err);
    return NextResponse.json({ error: "sweep failed" }, { status: 500 });
  }
}
