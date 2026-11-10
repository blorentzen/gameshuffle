/**
 * POST /api/stripe/portal
 *
 * Opens the Stripe Customer Portal for the authenticated user. Returns
 * a one-shot URL the client redirects to — Stripe handles the entire
 * billing UX (update card, switch plan, cancel, view invoices) and
 * deep-links back to /account?tab=plans when the user is done.
 *
 * Requires the portal to be configured in the Stripe Dashboard
 * (https://dashboard.stripe.com/settings/billing/portal). If not
 * configured, Stripe returns an error that we surface as 502.
 *
 * Optional body `{ flow: { type: "subscription_cancel", product, subscriptionId? } }`
 * opens the portal straight on the cancel page for the account's GS Pro, GS
 * Circuit or monthly support subscription (after the "Before you go" window
 * saved why, POST /api/account/leave-feedback), and comes back to the plan's
 * tab when done. The subscription is looked up for this account on the
 * server; one already set to end is refused (409 already_ending). Without a
 * flow, the portal opens on its home page as before.
 */

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getBaseUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminSupabase } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe/client";
import { isLeaveProduct } from "@/lib/account/leaveReasons";
import { liveSubscriptionFor } from "@/lib/billing/cancellations";

export const runtime = "nodejs";

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin credentials missing");
  return createAdminSupabase(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function publicBaseUrl(request: Request): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    new URL(request.url).origin ||
    getBaseUrl()
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Optional deep link: the cancel page for one of the account's subscriptions.
  const body = (await request.json().catch(() => null)) as { flow?: { type?: unknown; product?: unknown; subscriptionId?: unknown } } | null;
  const flow = body?.flow ?? null;
  if (flow && (flow.type !== "subscription_cancel" || !isLeaveProduct(flow.product))) {
    return NextResponse.json({ error: "bad_flow" }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: userRow } = await admin
    .from("users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  let customerId = userRow?.stripe_customer_id as string | null;
  let returnUrl = `${publicBaseUrl(request)}/account?tab=plans`;
  let flowData: Stripe.BillingPortal.SessionCreateParams["flow_data"];
  if (flow && isLeaveProduct(flow.product)) {
    const sub = await liveSubscriptionFor(user.id, flow.product, typeof flow.subscriptionId === "string" ? flow.subscriptionId : null);
    if (!sub) return NextResponse.json({ error: "no_subscription" }, { status: 404 });
    if (sub.ending) return NextResponse.json({ error: "already_ending" }, { status: 409 });
    // The subscription's own customer: the cancel page only opens for a subscription of the session's customer.
    customerId = sub.customer ?? customerId;
    if (flow.product === "support") returnUrl = `${publicBaseUrl(request)}/account?tab=support`;
    flowData = {
      type: "subscription_cancel",
      subscription_cancel: { subscription: sub.id },
      after_completion: { type: "redirect", redirect: { return_url: returnUrl } },
    };
  }
  if (!customerId) {
    return NextResponse.json({ error: "no_customer" }, { status: 400 });
  }

  const stripe = getStripe();
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
      ...(flowData ? { flow_data: flowData } : {}),
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe-portal] create failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "portal_failed", message }, { status: 502 });
  }
}
