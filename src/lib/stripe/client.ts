/**
 * Stripe SDK singleton + env-var guards. Server-side only.
 *
 * Tier/billing flows that need Stripe import from here. The key decision
 * captured in one place: API version is pinned so upgrading the SDK
 * doesn't silently change webhook payload shape.
 */

import Stripe from "stripe";

// Pinned API version — matches the installed SDK. Bump intentionally after
// reviewing Stripe's changelog for webhook payload shape changes.
const STRIPE_API_VERSION = "2026-03-25.dahlia" as const;

let cachedClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (cachedClient) return cachedClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY env var is not set. Required for billing flows."
    );
  }
  cachedClient = new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
  });
  return cachedClient;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET env var is not set. Required to verify webhook signatures."
    );
  }
  return secret;
}

export function getStripePriceId(interval: "monthly" | "annual"): string {
  const key =
    interval === "monthly" ? "STRIPE_PRICE_ID_MONTHLY" : "STRIPE_PRICE_ID_ANNUAL";
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} env var is not set.`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// GameShuffle Circuit prices (separate product from Pro). Env overrides win so
// test/live modes can differ; the fallbacks are the live price IDs provided.
// ---------------------------------------------------------------------------

export type CircuitPaidTierId = "circuit_64" | "circuit_256";

const CIRCUIT_PRICES: Record<CircuitPaidTierId, { monthly: string; annual: string }> = {
  circuit_64: {
    monthly: process.env.STRIPE_PRICE_CIRCUIT_64_MONTHLY || "price_1UEHKIGVMWt8vRrCDiwM1vDL",
    annual: process.env.STRIPE_PRICE_CIRCUIT_64_ANNUAL || "price_1UEHKIGVMWt8vRrCN5KIFoUy",
  },
  circuit_256: {
    monthly: process.env.STRIPE_PRICE_CIRCUIT_256_MONTHLY || "price_1UEHLPGVMWt8vRrCwFnsQ8sv",
    annual: process.env.STRIPE_PRICE_CIRCUIT_256_ANNUAL || "price_1UEHLPGVMWt8vRrCLbvm85hj",
  },
};

export function getCircuitPriceId(tier: CircuitPaidTierId, interval: "monthly" | "annual"): string {
  return CIRCUIT_PRICES[tier][interval];
}

/** Reverse lookup: which Circuit tier a Stripe price belongs to, else null.
 *  Lets the webhook route a subscription to Pro vs Circuit by price. */
export function resolveCircuitTierFromPrice(priceId: string | null | undefined): CircuitPaidTierId | null {
  if (!priceId) return null;
  for (const tier of Object.keys(CIRCUIT_PRICES) as CircuitPaidTierId[]) {
    const p = CIRCUIT_PRICES[tier];
    if (priceId === p.monthly || priceId === p.annual) return tier;
  }
  return null;
}

/** Best-effort billing interval for a Stripe price (Pro or Circuit). Returns
 *  null when the id doesn't match a known price. Used to render the current
 *  plan's interval + drive the plan-change resolver. */
export function resolveIntervalFromPrice(priceId: string | null | undefined): "monthly" | "annual" | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_ID_MONTHLY) return "monthly";
  if (priceId === process.env.STRIPE_PRICE_ID_ANNUAL) return "annual";
  for (const tier of Object.keys(CIRCUIT_PRICES) as CircuitPaidTierId[]) {
    const p = CIRCUIT_PRICES[tier];
    if (priceId === p.monthly) return "monthly";
    if (priceId === p.annual) return "annual";
  }
  return null;
}
