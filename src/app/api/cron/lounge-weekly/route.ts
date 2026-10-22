/**
 * GET /api/cron/lounge-weekly: the Monday lounge report (GS Pro, lounge night picks 2026-10-20).
 * Scheduled Mondays at 16:00 and 17:00 UTC; it sends from 9am Pacific on (PST's 16:00 run is
 * 8am and does nothing; in PDT the 17:00 run picks up anyone MKCentral didn't answer for at 9).
 * Each report is claimed per account and week before it's sent, so a second run never doubles.
 * See src/lib/lounge/weeklyReport.ts.
 *
 *   ?force           send outside Monday 9am (still once per account and week)
 *   ?week=YYYY-MM-DD the Monday of the week to report (default: last week)
 *   ?dry=1           build the reports and return them without sending or claiming
 *   ?user=<uuid|username>  only this account (with ?dry, a preview for a test account)
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` (required in production for every option).
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendWeeklyReports } from "@/lib/lounge/weeklyReport";
import { gsDay, gsHour, gsWeekday } from "@/lib/time/gsClock";

export const runtime = "nodejs";
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/lounge-weekly] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }
  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";
  const now = Date.now();
  if (!dry && !url.searchParams.has("force") && (gsWeekday(gsDay(now)) !== 1 || gsHour(now) < 9)) {
    return NextResponse.json({ ok: true, sent: 0, note: "not_monday_9am_pacific" });
  }
  const weekParam = url.searchParams.get("week");
  if (weekParam && (!/^\d{4}-\d{2}-\d{2}$/.test(weekParam) || gsWeekday(weekParam) !== 1)) {
    return NextResponse.json({ error: "week must be a Monday (YYYY-MM-DD)" }, { status: 400 });
  }
  let onlyUser: string | null = null;
  const who = url.searchParams.get("user");
  if (who) {
    if (UUID.test(who)) onlyUser = who;
    else {
      const { data } = await createServiceClient().from("users").select("id").ilike("username", who.toLowerCase()).maybeSingle();
      onlyUser = (data as { id: string } | null)?.id ?? null;
      if (!onlyUser) return NextResponse.json({ error: "no such user" }, { status: 404 });
    }
  }
  try {
    const result = await sendWeeklyReports({ weekOf: weekParam ?? undefined, dry, onlyUser });
    return NextResponse.json({ ok: true, dry, ...result });
  } catch (err) {
    console.error("[cron/lounge-weekly] failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
