/**
 * GET /api/cron/trial-reminder
 *
 * Daily sweep that fires the day-13 ("trial ends tomorrow") reminder.
 *
 * Stripe's `customer.subscription.trial_will_end` webhook handles the
 * day-11 (3-days-out) reminder, but Stripe doesn't fire a 1-day-out
 * event — so we sweep the local `subscriptions` table instead.
 *
 * Auth: Vercel Cron sends an `Authorization: Bearer <CRON_SECRET>` header.
 * Reject anything without it so the route can't be triggered manually.
 *
 * Idempotence: every send stamps `subscriptions.reminder_day13_sent_at`
 * so re-runs on the same day skip already-notified rows.
 *
 * Schedule: see `vercel.json` cron entry — runs once per day.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendTrialEndingTomorrowEmail } from "@/lib/email/billing";

export const runtime = "nodejs";

interface TrialingSub {
  id: string;
  user_id: string;
  trial_end: string;
  price_id: string | null;
}

function intervalForPriceId(priceId: string | null): "monthly" | "annual" | undefined {
  if (!priceId) return undefined;
  if (priceId === process.env.STRIPE_PRICE_ID_MONTHLY) return "monthly";
  if (priceId === process.env.STRIPE_PRICE_ID_ANNUAL) return "annual";
  return undefined;
}

function priceForInterval(interval: "monthly" | "annual" | undefined): string | undefined {
  if (interval === "monthly") return "9.00";
  if (interval === "annual") return "99.00";
  return undefined;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/trial-reminder] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const admin = createServiceClient();

  // Window: trials ending between 23h and 25h from now. The 2-hour band
  // gives slack so a daily sweep doesn't miss anyone if it runs slightly
  // late or trial_end has minute-level precision.
  const now = Date.now();
  const windowStart = new Date(now + 23 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(now + 25 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await admin
    .from("subscriptions")
    .select("id, user_id, trial_end, price_id")
    .eq("status", "trialing")
    .is("reminder_day13_sent_at", null)
    .gte("trial_end", windowStart)
    .lte("trial_end", windowEnd);

  if (error) {
    console.error("[cron/trial-reminder] sweep query failed:", error);
    return NextResponse.json({ error: "sweep_failed" }, { status: 500 });
  }

  const subs = (rows as TrialingSub[] | null) ?? [];
  let sent = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const sub of subs) {
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(sub.user_id);
      const email = authUser?.user?.email ?? null;
      if (!email) {
        console.warn(`[cron/trial-reminder] no email for user ${sub.user_id}`);
        continue;
      }
      const { data: profileRow } = await admin
        .from("users")
        .select("display_name")
        .eq("id", sub.user_id)
        .maybeSingle();
      const interval = intervalForPriceId(sub.price_id);
      const result = await sendTrialEndingTomorrowEmail({
        to: email,
        name: (profileRow?.display_name as string | null) ?? null,
        trialEndsAt: new Date(sub.trial_end),
        amount: priceForInterval(interval),
        interval,
      });
      if (result.ok) {
        await admin
          .from("subscriptions")
          .update({ reminder_day13_sent_at: new Date().toISOString() })
          .eq("id", sub.id);
        sent++;
      } else {
        failed++;
        failures.push(email);
      }
    } catch (err) {
      console.error(`[cron/trial-reminder] failed for sub ${sub.id}:`, err);
      failed++;
    }
  }

  return NextResponse.json({
    swept: subs.length,
    sent,
    failed,
    ...(failures.length > 0 ? { failures } : {}),
  });
}
