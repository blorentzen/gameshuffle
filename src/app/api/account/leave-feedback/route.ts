/**
 * POST /api/account/leave-feedback  { product: "pro" | "circuit" | "support", reason?, comment?, subscriptionId? }
 *
 * The "Before you go" window's answer, saved just before Stripe's cancel page opens
 * (POST /api/stripe/portal with a subscription_cancel flow). The subscription is the account's own live
 * one for that product, looked up here; nothing is cancelled by this route. A save that fails (or a
 * database without supabase/leave-reasons-m1.sql) answers `saved: false` and the person still goes on
 * to cancel: we never stand between someone and cancelling.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { parseLeaveFeedback } from "@/lib/account/leaveReasons";
import { liveSubscriptionFor, saveLeaveFeedback } from "@/lib/billing/cancellations";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const parsed = parseLeaveFeedback(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  if (!(await rateLimit(`leave-feedback:${user.id}`, { max: 10, windowMs: 60 * 60_000 })).ok) {
    return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });
  }

  const { product, reason, comment, subscriptionId } = parsed.value;
  const sub = await liveSubscriptionFor(user.id, product, subscriptionId);
  if (!sub) return NextResponse.json({ ok: false, error: "no_subscription" }, { status: 404 });
  if (sub.ending) return NextResponse.json({ ok: false, error: "already_ending" }, { status: 409 });

  const saved = await saveLeaveFeedback({ userId: user.id, product, subscriptionId: sub.id, reason, comment });
  return NextResponse.json({ ok: true, saved: saved.ok, subscriptionId: sub.id });
}
