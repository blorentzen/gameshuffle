/**
 * GET /api/cron/discord-reminders
 *
 * Fires due /gs-remind reminders. Runs every minute. Auth: Vercel Cron Bearer.
 */

import { NextResponse } from "next/server";
import { fireDueReminders } from "@/lib/discord/reminders";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/discord-reminders] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const fired = await fireDueReminders();
  return NextResponse.json({ ok: true, fired });
}
