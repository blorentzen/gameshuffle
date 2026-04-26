/**
 * Subscription state helpers — bridges our `subscriptions` table with
 * Stripe webhook events. Stripe is the source of truth; this module
 * mirrors state locally for query speed and drives `users.subscription_tier`.
 *
 * Import flow: webhook handler → upsertSubscriptionFromStripe(sub) → syncs
 * a row in `public.subscriptions` + flips the user's tier on users.
 */

import type Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { isStaffRole, type SubscriptionTier } from "@/lib/subscription";
import { disconnectTwitchIntegration } from "@/lib/twitch/disconnect";

// Active-ish statuses that should resolve the user to Pro. Anything else
// (canceled, incomplete_expired, unpaid, paused) drops them back to Free.
const PRO_STATUSES: ReadonlySet<string> = new Set([
  "trialing",
  "active",
  "past_due", // grace period — keep Pro while Stripe retries payment
]);

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error("Supabase admin credentials missing");
  }
  return createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Resolve the user_id for a given stripe_customer_id. Falls back to
 * reading `users.stripe_customer_id` if we don't have a row in
 * `subscriptions` yet (which is the common case on the very first
 * checkout.session.completed for a given customer).
 */
export async function findUserIdForStripeCustomer(
  stripeCustomerId: string
): Promise<string | null> {
  const admin = getAdmin();
  const { data: userRow } = await admin
    .from("users")
    .select("id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();
  if (userRow?.id) return userRow.id as string;

  const { data: subRow } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();
  return (subRow?.user_id as string | undefined) ?? null;
}

function tierFromStatus(status: string): SubscriptionTier {
  return PRO_STATUSES.has(status) ? "pro" : "free";
}

function toIsoOrNull(seconds: number | null | undefined): string | null {
  if (!seconds || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

/**
 * Upsert a Stripe subscription into our local table and sync the user's
 * tier on `public.users`. Safe to call repeatedly — it's driven by
 * webhook events that may arrive out of order, and all writes are
 * idempotent based on stripe_subscription_id.
 */
export async function upsertSubscriptionFromStripe(args: {
  subscription: Stripe.Subscription;
  userId: string;
}): Promise<void> {
  const admin = getAdmin();
  const { subscription, userId } = args;

  // Determine price_id from the first subscription item (we only ever
  // bill one price per subscription today).
  const firstItem = subscription.items.data[0];
  const priceId = firstItem?.price?.id ?? null;

  const row = {
    user_id: userId,
    stripe_customer_id:
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id,
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    tier: "pro",
    price_id: priceId,
    // `current_period_start` / `current_period_end` live on the subscription
    // item in the 2026-03-25 API (subscription-level fields were deprecated).
    current_period_start: toIsoOrNull(firstItem?.current_period_start),
    current_period_end: toIsoOrNull(firstItem?.current_period_end),
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: toIsoOrNull(subscription.canceled_at),
    trial_start: toIsoOrNull(subscription.trial_start),
    trial_end: toIsoOrNull(subscription.trial_end),
    updated_at: new Date().toISOString(),
  };

  // Snapshot the user's tier + role BEFORE we mutate so we can detect a
  // downgrade transition (pro → free) in this same webhook event.
  const { data: preUser } = await admin
    .from("users")
    .select("subscription_tier, role")
    .eq("id", userId)
    .maybeSingle();
  const previousTier = (preUser?.subscription_tier ?? "free") as string;
  const userIsStaff = isStaffRole(preUser?.role ?? null);

  // Upsert on stripe_subscription_id so restarts/updates don't create duplicates
  const { error: upsertErr } = await admin
    .from("subscriptions")
    .upsert(row, { onConflict: "stripe_subscription_id" });
  if (upsertErr) {
    console.error("[stripe-sub-sync] upsert failed:", upsertErr);
    throw upsertErr;
  }

  // Flip the user's tier + persist trial usage + cache customer id
  const tier = tierFromStatus(subscription.status);
  const hasTrialedPatch =
    subscription.trial_start != null ? { has_used_trial: true } : {};
  await admin
    .from("users")
    .update({
      subscription_tier: tier,
      subscription_status: subscription.status,
      stripe_customer_id: row.stripe_customer_id,
      ...hasTrialedPatch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  // Pro → Free downgrade cleanup per gs-subscription-architecture.md §5.
  // Staff bypass the cleanup because their effective tier stays Pro
  // regardless of Stripe state. The disconnect helper is a no-op when
  // the user has no Twitch connection.
  if (tier === "free" && previousTier === "pro" && !userIsStaff) {
    try {
      const result = await disconnectTwitchIntegration(userId);
      if (!result.alreadyDisconnected) {
        console.info(
          `[stripe-sub-sync] auto-disconnected Twitch for user ${userId} on downgrade`
        );
      }
    } catch (err) {
      // Don't fail the webhook over a disconnect error — it'll be retried
      // on the next subscription event and the UI can also surface a
      // "clean up your Twitch" prompt on the Plans tab if needed.
      console.error(
        `[stripe-sub-sync] Twitch auto-disconnect failed for user ${userId}:`,
        err
      );
    }
  }
}

/**
 * Read the user's most recent subscription row, joined with the relevant
 * user fields. Used by /account?tab=plans to render the current plan
 * card. Returns null if the user has never had a subscription.
 */
export interface SubscriptionView {
  status: string;
  tier: string;
  priceId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null;
  stripeCustomerId: string;
}

export async function getLatestSubscriptionForUser(
  userId: string
): Promise<SubscriptionView | null> {
  const admin = getAdmin();
  const { data } = await admin
    .from("subscriptions")
    .select(
      "status, tier, price_id, current_period_end, cancel_at_period_end, trial_end, stripe_customer_id"
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    status: data.status as string,
    tier: data.tier as string,
    priceId: (data.price_id as string | null) ?? null,
    currentPeriodEnd: (data.current_period_end as string | null) ?? null,
    cancelAtPeriodEnd: !!data.cancel_at_period_end,
    trialEnd: (data.trial_end as string | null) ?? null,
    stripeCustomerId: data.stripe_customer_id as string,
  };
}
