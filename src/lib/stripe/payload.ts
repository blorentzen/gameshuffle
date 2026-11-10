import type Stripe from "stripe";

/**
 * Readers for Stripe webhook payloads. The account sends events at its
 * default API version (2026-04-22.dahlia), not the version the SDK pins, and
 * since 2025-03-31 a few fields moved: an invoice's subscription and a
 * subscription's period end. Each reader takes the current location first
 * and the old one as a fallback, so a payload from either version works.
 */

function intervalForPriceId(priceId: string | null | undefined): "monthly" | "annual" | undefined {
  if (!priceId) return undefined;
  if (priceId === process.env.STRIPE_PRICE_ID_MONTHLY) return "monthly";
  if (priceId === process.env.STRIPE_PRICE_ID_ANNUAL) return "annual";
  return undefined;
}

/**
 * Monthly or annual, from the env price ids or, for prices made since
 * (Platform > Pricing changes create new ids), from the price itself.
 */
export function intervalForPrice(price: Stripe.Price | null | undefined): "monthly" | "annual" | undefined {
  const byEnv = intervalForPriceId(price?.id);
  if (byEnv) return byEnv;
  const interval = price?.recurring?.interval;
  return interval === "month" ? "monthly" : interval === "year" ? "annual" : undefined;
}

/** When the current period ends (unix seconds): on the first subscription item since 2025-03-31. */
export function periodEndOf(sub: Stripe.Subscription): number | undefined {
  const legacy = (sub as Stripe.Subscription & { current_period_end?: number }).current_period_end;
  return sub.items?.data?.[0]?.current_period_end ?? legacy ?? undefined;
}

/** The subscription an invoice bills: invoice.parent.subscription_details since 2025-03-31. */
export function subscriptionIdOf(invoice: Stripe.Invoice): string | null {
  const legacy = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription;
  const ref = invoice.parent?.subscription_details?.subscription ?? legacy ?? null;
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

export interface SubscriptionCancellation {
  /** Set to cancel (cancel_at_period_end or a cancel_at date) or already canceled. */
  ending: boolean;
  /** When it ends or ended (unix seconds), when known. */
  cancelAt: number | null;
  /** The customer portal's reason ("too_expensive", "switched_service", "unused", "other"…), if asked. */
  feedback: string | null;
  /** The customer portal's comment box, if filled in. */
  comment: string | null;
  /** Why Stripe canceled it: "cancellation_requested", "payment_failed" or "payment_disputed". */
  reason: string | null;
}

/**
 * Whether a subscription is ending and what the customer told the portal about it
 * (cancellation_details). A scheduled cancel ends at cancel_at, or at the period end when only
 * cancel_at_period_end is set; a canceled one at ended_at, else canceled_at.
 */
export function cancellationOf(sub: Stripe.Subscription): SubscriptionCancellation {
  const details = (sub as Stripe.Subscription & { cancellation_details?: Stripe.Subscription.CancellationDetails | null }).cancellation_details ?? null;
  const canceled = sub.status === "canceled" || sub.status === "incomplete_expired";
  const scheduled = !!sub.cancel_at_period_end || !!sub.cancel_at;
  const cancelAt = canceled
    ? sub.ended_at ?? sub.canceled_at ?? sub.cancel_at ?? null
    : sub.cancel_at ?? (sub.cancel_at_period_end ? periodEndOf(sub) ?? null : null);
  const comment = typeof details?.comment === "string" && details.comment.trim() ? details.comment.trim() : null;
  return { ending: canceled || scheduled, cancelAt, feedback: details?.feedback ?? null, comment, reason: details?.reason ?? null };
}

export interface ShippingAddress { name: string | null; line1: string | null; line2: string | null; city: string | null; state: string | null; postal: string | null; country: string | null }

/** Where a Checkout Session ships: collected_information.shipping_details since 2025-03-31. */
export function shippingOf(session: Stripe.Checkout.Session): ShippingAddress | null {
  const legacy = (session as Stripe.Checkout.Session & { shipping_details?: { name?: string | null; address?: Stripe.Address | null } | null }).shipping_details;
  const s = session.collected_information?.shipping_details ?? legacy ?? null;
  if (!s) return null;
  const a = s.address;
  return {
    name: s.name ?? null, line1: a?.line1 ?? null, line2: a?.line2 ?? null, city: a?.city ?? null,
    state: a?.state ? a.state.toUpperCase() : null, postal: a?.postal_code ?? null, country: a?.country ?? null,
  };
}
