/**
 * GET /api/cron/board-game-night-reminders
 *
 * Hourly: sends the one-time "your game night is coming up" reminder (in-app +
 * email) to everyone who RSVP'd going, ~24h before start. Auth: Vercel Cron
 * Bearer CRON_SECRET (same pattern as the other cron sweeps). Idempotent via the
 * atomic `reminder_sent_at` claim in the store.
 */
import { NextResponse } from "next/server";
import { sendDueNightReminders } from "@/lib/board-game-nights/reminders";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/board-game-night-reminders] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const result = await sendDueNightReminders();
  return NextResponse.json({ ok: true, ...result });
}
