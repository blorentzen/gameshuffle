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
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminSupabase } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe/client";

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

  const admin = getAdmin();
  const { data: userRow } = await admin
    .from("users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  const customerId = userRow?.stripe_customer_id as string | null;
  if (!customerId) {
    return NextResponse.json({ error: "no_customer" }, { status: 400 });
  }

  const stripe = getStripe();
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${publicBaseUrl(request)}/account?tab=plans`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe-portal] create failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "portal_failed", message }, { status: 502 });
  }
}
