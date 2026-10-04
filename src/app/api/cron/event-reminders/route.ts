/**
 * GET /api/cron/event-reminders
 *
 * Every 15 minutes: the one reminder engine for tournaments AND game nights
 * (day + hour bands, in-app + email, Discord announce for nights), plus the
 * tournament "check-in is open" alert. Replaces
 * /api/cron/tournament-reminders and /api/cron/game-night-reminders.
 * Auth: Vercel Cron `Authorization: Bearer <CRON_SECRET>`. Idempotent via the
 * `event_reminders_sent` ledger. Schedule: see `vercel.json`.
 */

import { NextResponse } from "next/server";
import { sendDueEventReminders, sendCheckInOpenAlerts } from "@/lib/events/reminders";
import { expireOffers } from "@/lib/events/waitlist";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/event-reminders] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }
  // Reminders first: the check-in pass reads which hour reminders just went
  // out so it can skip anyone already told check-in was open.
  const result = await sendDueEventReminders();
  const checkIn = await sendCheckInOpenAlerts();
  // Waitlist offers past their deadline move on to the next person.
  const offersExpired = await expireOffers().catch((e) => { console.error("[cron/event-reminders] expireOffers failed:", e); return 0; });
  return NextResponse.json({ ok: true, ...result, checkIn, offersExpired });
}
