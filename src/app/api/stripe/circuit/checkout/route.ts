/**
 * POST /api/stripe/circuit/checkout
 *
 * Body: { tier: 'circuit_64' | 'circuit_256', interval: 'monthly' | 'annual' }
 *
 * Creates (or reuses) the user's Stripe Customer and a Checkout Session for a
 * GameShuffle Circuit subscription — a SEPARATE product from GS Pro (a user can
 * hold both). No trial. Returns { url } for the client to redirect to.
 */

import { NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminSupabase } from "@supabase/supabase-js";
import { getStripe, getCircuitPriceId, type CircuitPaidTierId } from "@/lib/stripe/client";
import { resolveStripePriceId } from "@/lib/pricing/catalog";

export const runtime = "nodejs";

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin credentials missing");
  return createAdminSupabase(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function publicBaseUrl(request: Request): string {
  return process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin || getBaseUrl();
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const tier = body.tier as string | undefined;
  const interval = body.interval as string | undefined;
  if (tier !== "circuit_64" && tier !== "circuit_256") {
    return NextResponse.json({ error: "invalid_tier" }, { status: 400 });
  }
  if (interval !== "monthly" && interval !== "annual") {
    return NextResponse.json({ error: "invalid_interval" }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: userRow } = await admin
    .from("users")
    .select("stripe_customer_id, display_name")
    .eq("id", user.id)
    .maybeSingle();

  const stripe = getStripe();

  let customerId = (userRow?.stripe_customer_id as string | null) ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: (userRow?.display_name as string | null) ?? undefined,
      metadata: { gs_user_id: user.id },
    });
    customerId = customer.id;
    await admin.from("users").update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() }).eq("id", user.id);
  }

  const priceId = await resolveStripePriceId(`${tier}_${interval}`).catch(() => getCircuitPriceId(tier as CircuitPaidTierId, interval));
  const baseUrl = publicBaseUrl(request);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      metadata: { gs_user_id: user.id, product: "circuit", circuit_tier: tier },
    },
    payment_method_collection: "always",
    allow_promotion_codes: true,
    consent_collection: { terms_of_service: "required" },
    custom_text: {
      terms_of_service_acceptance: {
        message: "I agree to the [Terms of Service](https://www.gameshuffle.co/terms) and [Privacy Policy](https://www.gameshuffle.co/privacy).",
      },
      submit: { message: "Charges appear as EMPAC* GS CIRCUIT. GameShuffle is built by Empac." },
    },
    success_url: `${baseUrl}/account?tab=plans&circuit_checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/gs-circuit?circuit_checkout=canceled`,
    client_reference_id: user.id,
    metadata: { gs_user_id: user.id, interval, product: "circuit", circuit_tier: tier },
  });

  if (!session.url) {
    console.error("[circuit-checkout] no url returned from session:", session.id);
    return NextResponse.json({ error: "no_checkout_url" }, { status: 502 });
  }
  return NextResponse.json({ url: session.url });
}
