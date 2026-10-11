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
