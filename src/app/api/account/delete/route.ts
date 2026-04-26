/**
 * POST /api/account/delete
 *
 * Self-service account deletion. Privacy Policy and Terms publicly commit
 * to immediate, complete deletion — this route honors that contract.
 *
 * Cascade order (matters because once auth.users is gone, we lose the
 * customer ID and Twitch tokens needed for external cleanup):
 *
 *   1. Cancel any active Stripe subscriptions (no proration, no further charges)
 *   2. Tear down Twitch streamer integration (revoke tokens, delete EventSub
 *      subs + channel point reward, drop the connection row + cascades)
 *   3. Send account-deleted confirmation email
 *   4. Delete the auth.users row — this triggers DB cascade for public.users
 *      and every table FK'd to it (saved_configs, tournaments, lounge_*,
 *      subscriptions, etc.) plus removes all linked OAuth identities
 *
 * Each external step is best-effort — we log and continue rather than
 * abandoning the deletion halfway through. The user's clear intent is
 * "remove me"; an external retry on a Stripe sub or Twitch token doesn't
 * justify leaving them in our DB.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { disconnectTwitchIntegration } from "@/lib/twitch/disconnect";
import { sendAccountDeletedEmail } from "@/lib/email/account";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = user.id;
  const userEmail = user.email ?? null;
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const displayName =
    (typeof meta?.display_name === "string" && meta.display_name) ||
    (typeof meta?.full_name === "string" && meta.full_name) ||
    null;

  const admin = createServiceClient();

  // 1. Stripe — cancel any active subs immediately. Account-deletion is a
  //    full break, not "cancel at period end". Use the customer ID from
  //    public.users (set during checkout); fall back to nothing if absent.
  try {
    const { data: userRow } = await admin
      .from("users")
      .select("stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();
    const stripeCustomerId = userRow?.stripe_customer_id as string | null | undefined;
    if (stripeCustomerId) {
      const stripe = getStripe();
      const subs = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: "all",
        limit: 100,
      });
      for (const sub of subs.data) {
        if (sub.status === "canceled" || sub.status === "incomplete_expired") continue;
        try {
          await stripe.subscriptions.cancel(sub.id, { invoice_now: false, prorate: false });
        } catch (err) {
          console.error(`[account/delete] failed to cancel sub ${sub.id}:`, err);
        }
      }
    }
  } catch (err) {
    console.error("[account/delete] Stripe cancellation step failed:", err);
  }

  // 2. Twitch streamer integration — revoke tokens, delete EventSub subs,
  //    delete channel point reward, drop the twitch_connections row.
  try {
    await disconnectTwitchIntegration(userId);
  } catch (err) {
    console.error("[account/delete] Twitch teardown failed:", err);
  }

  // 3. Confirmation email — best-effort. If this fails, the user still gets
  //    deleted; they just don't get the courtesy receipt.
  if (userEmail) {
    try {
      await sendAccountDeletedEmail({ to: userEmail, name: displayName });
    } catch (err) {
      console.error("[account/delete] confirmation email failed:", err);
    }
  }

  // 4. The actual delete. Cascades through public.users (FK ON DELETE
  //    CASCADE → saved_configs, tournaments, lounge_*, subscriptions,
  //    twitch_connections-residual, etc.) and clears auth identities.
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error("[account/delete] auth.users delete failed:", deleteError);
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
