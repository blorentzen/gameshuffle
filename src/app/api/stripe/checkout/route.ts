/**
 * POST /api/stripe/checkout
 *
 * Body: { interval: 'monthly' | 'annual' }
 *
 * Creates (or reuses) a Stripe Customer for the authenticated user and
 * a Checkout Session for the Pro subscription. New users get a 14-day
 * free trial; anyone who has used the trial before (has_used_trial=true)
 * is redirected straight to paid. Credit card required in both cases.
 *
 * Returns { url } — the client redirects to Stripe's hosted Checkout.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminSupabase } from "@supabase/supabase-js";
import { getStripe, getStripePriceId } from "@/lib/stripe/client";

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
    "https://www.gameshuffle.co"
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

  const body = await request.json().catch(() => ({}));
  const interval = body.interval as string | undefined;
  if (interval !== "monthly" && interval !== "annual") {
    return NextResponse.json({ error: "invalid_interval" }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: userRow } = await admin
    .from("users")
    .select("stripe_customer_id, has_used_trial, display_name")
    .eq("id", user.id)
    .maybeSingle();

  const stripe = getStripe();

  // Reuse existing Stripe customer if we have one; otherwise create fresh
  // with our user_id in metadata so webhooks can trace events back.
  let customerId = (userRow?.stripe_customer_id as string | null) ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: (userRow?.display_name as string | null) ?? undefined,
      metadata: { gs_user_id: user.id },
    });
    customerId = customer.id;
    await admin
      .from("users")
      .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
      .eq("id", user.id);
  }

  const hasUsedTrial = !!userRow?.has_used_trial;
  const priceId = getStripePriceId(interval);
  const baseUrl = publicBaseUrl(request);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: hasUsedTrial ? undefined : 14,
      metadata: { gs_user_id: user.id },
      trial_settings: hasUsedTrial
        ? undefined
        : {
            end_behavior: {
              // If the user doesn't have a valid payment method at trial end,
              // cancel the subscription rather than creating an unpaid invoice.
              missing_payment_method: "cancel",
            },
          },
    },
    // Require a payment method on the Checkout page even during trial —
    // lowers trial-start rate but dramatically improves conversion
    // (per subscription-architecture spec §3).
    payment_method_collection: "always",
    allow_promotion_codes: true,
    // Force the user to accept ToS on the Checkout page (in addition to the
    // signup-time agreement). Stripe records the acceptance with timestamp
    // + IP and exposes it on the resulting Subscription via Customer.
    consent_collection: {
      terms_of_service: "required",
    },
    custom_text: {
      terms_of_service_acceptance: {
        message:
          "I agree to the [Terms of Service](https://gameshuffle.co/terms) and [Privacy Policy](https://gameshuffle.co/privacy).",
      },
      submit: {
        message:
          "Charges appear as EMPAC* GS PRO. GameShuffle is built by Empac.",
      },
    },
    success_url: `${baseUrl}/account?tab=plans&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/account?tab=plans&checkout=canceled`,
    client_reference_id: user.id,
    metadata: { gs_user_id: user.id, interval },
  });

  if (!session.url) {
    console.error("[stripe-checkout] no url returned from session:", session.id);
    return NextResponse.json({ error: "no_checkout_url" }, { status: 502 });
  }

  return NextResponse.json({ url: session.url });
}
