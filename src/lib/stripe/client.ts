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
