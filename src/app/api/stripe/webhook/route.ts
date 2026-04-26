/**
 * POST /api/stripe/webhook
 *
 * Stripe → GameShuffle event sink. Every state change that matters to
 * tier resolution flows through here:
 *
 *   checkout.session.completed     → customer + first subscription known
 *   customer.subscription.created  → same data, canonical upsert
 *   customer.subscription.updated  → status, trial_end, cancel_at_period_end, etc.
 *   customer.subscription.deleted  → final cancellation; downgrade to Free
 *   invoice.paid                   → renewal; resync to pick up new period
 *   invoice.payment_failed         → status transitions to past_due
 *
 * Signature verified against STRIPE_WEBHOOK_SECRET. Delivery is
 * at-least-once; all handlers are idempotent.
 */

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe/client";
import {
  findUserIdForStripeCustomer,
  upsertSubscriptionFromStripe,
} from "@/lib/stripe/subscriptions";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  sendTrialStartedEmail,
  sendTrialEndingEmail,
  sendTrialConvertedEmail,
  sendPaymentFailedEmail,
  sendSubscriptionCancelledEmail,
  sendSubscriptionReactivatedEmail,
} from "@/lib/email/billing";

export const runtime = "nodejs";

/**
 * Resolve the contact info for a GS user — email + display name. Read from
 * auth.users + public.users. Returns null when either is missing so the
 * caller can skip the send rather than crash the webhook.
 */
async function getContactForUser(userId: string): Promise<{ email: string; name: string | null } | null> {
  try {
    const admin = createServiceClient();
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    const email = authUser?.user?.email ?? null;
    if (!email) return null;
    const { data: profileRow } = await admin
      .from("users")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();
    return { email, name: (profileRow?.display_name as string | null) ?? null };
  } catch (err) {
    console.warn("[stripe-webhook] getContactForUser failed:", err);
    return null;
  }
}

function intervalForPriceId(priceId: string | null | undefined): "monthly" | "annual" | undefined {
  if (!priceId) return undefined;
  if (priceId === process.env.STRIPE_PRICE_ID_MONTHLY) return "monthly";
  if (priceId === process.env.STRIPE_PRICE_ID_ANNUAL) return "annual";
  return undefined;
}

function formatAmount(cents: number | null | undefined): string | undefined {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return undefined;
  return (cents / 100).toFixed(2);
}

async function syncFromSubscription(
  subscription: Stripe.Subscription,
  explicitUserId?: string
): Promise<{ userId: string; priorStatus: string | null; priorCancelAtPeriodEnd: boolean | null } | null> {
  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  // Prefer metadata — set by our checkout route. Fall back to lookup.
  let userId = explicitUserId ?? (subscription.metadata?.gs_user_id as string | undefined);
  if (!userId) {
    userId = (await findUserIdForStripeCustomer(stripeCustomerId)) ?? undefined;
  }
  if (!userId) {
    console.warn(
      `[stripe-webhook] no GS user_id resolvable for stripe_customer_id=${stripeCustomerId}; skipping`
    );
    return null;
  }

  // Read prior status + cancel_at_period_end BEFORE upsert so we can
  // detect transitions (trialing→active = converted; cancel-flag flip =
  // cancelled or reactivated).
  let priorStatus: string | null = null;
  let priorCancelAtPeriodEnd: boolean | null = null;
  try {
    const admin = createServiceClient();
    const { data: priorRow } = await admin
      .from("subscriptions")
      .select("status, cancel_at_period_end")
      .eq("stripe_subscription_id", subscription.id)
      .maybeSingle();
    priorStatus = (priorRow?.status as string | null) ?? null;
    priorCancelAtPeriodEnd =
      typeof priorRow?.cancel_at_period_end === "boolean"
        ? (priorRow.cancel_at_period_end as boolean)
        : null;
  } catch (err) {
    console.warn("[stripe-webhook] prior-state lookup failed:", err);
  }

  await upsertSubscriptionFromStripe({ subscription, userId });
  return { userId, priorStatus, priorCancelAtPeriodEnd };
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = getStripeWebhookSecret();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("missing signature", { status: 400 });
  }

  // Raw body needed for signature verification
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[stripe-webhook] signature verification failed:", message);
    return new Response(`signature verification failed: ${message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId =
          (session.client_reference_id as string | null) ??
          (session.metadata?.gs_user_id as string | undefined) ??
          undefined;
        if (session.subscription) {
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          await syncFromSubscription(sub, userId);
        }
        break;
      }

      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        const result = await syncFromSubscription(sub);
        // Trial-started welcome — only when this is genuinely the first
        // time we're seeing the sub (priorStatus === null) AND it begins
        // in the trialing state. Skip for direct paid signups (those get
        // the conversion email later via the trialing→active transition).
        if (result && result.priorStatus === null && sub.status === "trialing" && sub.trial_end) {
          const contact = await getContactForUser(result.userId);
          if (contact) {
            await sendTrialStartedEmail({
              to: contact.email,
              name: contact.name,
              trialEndsAt: new Date(sub.trial_end * 1000),
            }).catch((err) => console.error("[stripe-webhook] trial-started email failed:", err));
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const result = await syncFromSubscription(sub);
        if (!result) break;

        const periodEnd = (sub as Stripe.Subscription & { current_period_end?: number })
          .current_period_end;
        const item = sub.items?.data?.[0];
        const priceId = (item?.price?.id as string | null) ?? null;
        const amountCents = (item?.price?.unit_amount as number | null) ?? null;

        // Trial → active = trial converted into a paid subscription.
        if (result.priorStatus === "trialing" && sub.status === "active") {
          const contact = await getContactForUser(result.userId);
          if (contact) {
            await sendTrialConvertedEmail({
              to: contact.email,
              name: contact.name,
              amount: formatAmount(amountCents),
              interval: intervalForPriceId(priceId),
              nextRenewalAt: periodEnd ? new Date(periodEnd * 1000) : undefined,
            }).catch((err) => console.error("[stripe-webhook] trial-converted email failed:", err));
          }
        }

        // cancel_at_period_end flipped false→true = user cancelled
        // (still in grace period until current_period_end).
        if (
          result.priorCancelAtPeriodEnd === false &&
          sub.cancel_at_period_end === true
        ) {
          const contact = await getContactForUser(result.userId);
          if (contact && periodEnd) {
            await sendSubscriptionCancelledEmail({
              to: contact.email,
              name: contact.name,
              accessEndsAt: new Date(periodEnd * 1000),
            }).catch((err) => console.error("[stripe-webhook] cancelled email failed:", err));
          }
        }

        // cancel_at_period_end flipped true→false = user reactivated
        // before access ended.
        if (
          result.priorCancelAtPeriodEnd === true &&
          sub.cancel_at_period_end === false
        ) {
          const contact = await getContactForUser(result.userId);
          if (contact) {
            await sendSubscriptionReactivatedEmail({
              to: contact.email,
              name: contact.name,
              nextRenewalAt: periodEnd ? new Date(periodEnd * 1000) : undefined,
            }).catch((err) => console.error("[stripe-webhook] reactivated email failed:", err));
          }
        }

        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await syncFromSubscription(sub);
        break;
      }

      case "customer.subscription.trial_will_end": {
        // Stripe fires this 3 days before trial_end. Day-13 (1-day) reminders
        // would need a separate cron — defer per gs-cc-backlog.md P1.
        const sub = event.data.object as Stripe.Subscription;
        const stripeCustomerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const userId =
          (sub.metadata?.gs_user_id as string | undefined) ??
          (await findUserIdForStripeCustomer(stripeCustomerId)) ??
          undefined;
        if (userId && sub.trial_end) {
          const contact = await getContactForUser(userId);
          if (contact) {
            const item = sub.items?.data?.[0];
            const priceId = (item?.price?.id as string | null) ?? null;
            const amountCents = (item?.price?.unit_amount as number | null) ?? null;
            await sendTrialEndingEmail({
              to: contact.email,
              name: contact.name,
              trialEndsAt: new Date(sub.trial_end * 1000),
              amount: formatAmount(amountCents),
              interval: intervalForPriceId(priceId),
            }).catch((err) => console.error("[stripe-webhook] trial-ending email failed:", err));
          }
        }
        break;
      }

      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice & {
          subscription?: string | Stripe.Subscription | null;
        };
        if (invoice.subscription) {
          const subscriptionId =
            typeof invoice.subscription === "string"
              ? invoice.subscription
              : invoice.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const result = await syncFromSubscription(sub);

          // Notify the user once per failure attempt — Stripe Smart Retries
          // will keep firing this event each retry, so the inbox does
          // double-duty as a nudge.
          if (event.type === "invoice.payment_failed" && result) {
            const contact = await getContactForUser(result.userId);
            if (contact) {
              const amountCents = (invoice.amount_due as number | null) ?? null;
              await sendPaymentFailedEmail({
                to: contact.email,
                name: contact.name,
                amount: formatAmount(amountCents),
              }).catch((err) =>
                console.error("[stripe-webhook] payment-failed email failed:", err)
              );
            }
          }
        }
        break;
      }

      default:
        // Ignore events we don't handle — Stripe keeps firing otherwise.
        break;
    }
  } catch (err) {
    console.error(`[stripe-webhook] handler error for ${event.type}:`, err);
    // Return 500 so Stripe retries — safer than 200-eating a failure.
    return new Response("handler error", { status: 500 });
  }

  return NextResponse.json({ received: true });
}
