/**
 * Email subscription preferences.
 *
 * Source of truth for what categories exist and the client-side helpers
 * that wrap the `email_subscriptions` and `email_unsubscribe_tokens`
 * tables. Used by:
 *   - signup flow (record initial opt-in)
 *   - account preferences UI (read + toggle subscriptions)
 *   - one-click unsubscribe page (`/unsubscribe?token=...`)
 *   - marketing send pipeline (suppression check before queueing)
 *
 * Categories are intentionally narrow — adding a new category is a
 * deliberate decision that touches both the schema CHECK constraint and
 * the labels here.
 */

import "server-only";
import crypto from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  ALL_EMAIL_CATEGORIES,
  type EmailCategory,
} from "./subscription-categories";

// Re-export client-safe constants/types for callers that already import from
// this module — they'll get them transparently. New client code should
// import directly from `./subscription-categories` to avoid pulling
// `node:crypto` + admin Supabase into the client bundle.
export {
  EMAIL_CATEGORY_LABELS,
  EMAIL_CATEGORY_DESCRIPTIONS,
  SIGNUP_DEFAULT_CATEGORIES,
  ALL_EMAIL_CATEGORIES,
  type EmailCategory,
} from "./subscription-categories";

/**
 * Record a set of opt-ins for the given email. Idempotent — re-subscribing
 * to a category clears `unsubscribed_at`.
 */
export async function recordOptIns({
  email,
  userId,
  categories,
}: {
  email: string;
  userId: string | null;
  categories: EmailCategory[];
}): Promise<void> {
  if (categories.length === 0) return;
  const admin = createServiceClient();
  const normalized = email.toLowerCase().trim();

  const rows = categories.map((category) => ({
    email: normalized,
    user_id: userId,
    category,
    subscribed_at: new Date().toISOString(),
    unsubscribed_at: null,
  }));

  const { error } = await admin
    .from("email_subscriptions")
    .upsert(rows, { onConflict: "email,category" });
  if (error) {
    console.error("[email-subs] opt-in upsert failed:", error);
    throw error;
  }
}

/**
 * Mark every active subscription for this email as unsubscribed. Used by
 * the one-click unsubscribe link and "unsubscribe from all" UI control.
 */
export async function unsubscribeAll(email: string): Promise<void> {
  const admin = createServiceClient();
  const { error } = await admin
    .from("email_subscriptions")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("email", email.toLowerCase().trim())
    .is("unsubscribed_at", null);
  if (error) {
    console.error("[email-subs] unsubscribe-all failed:", error);
    throw error;
  }
}

/**
 * Mark a single category as unsubscribed for this email.
 */
export async function unsubscribeCategory(email: string, category: EmailCategory): Promise<void> {
  const admin = createServiceClient();
  const { error } = await admin
    .from("email_subscriptions")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("email", email.toLowerCase().trim())
    .eq("category", category)
    .is("unsubscribed_at", null);
  if (error) {
    console.error("[email-subs] unsubscribe-category failed:", error);
    throw error;
  }
}

/**
 * Get the user's current subscription state across all known categories.
 * Returns a map of category → boolean (true = subscribed, false = either
 * unsubscribed or never opted in).
 */
export async function getSubscriptionState(email: string): Promise<Record<EmailCategory, boolean>> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("email_subscriptions")
    .select("category, unsubscribed_at")
    .eq("email", email.toLowerCase().trim());

  const state: Record<EmailCategory, boolean> = {
    product_updates: false,
    tips_and_guides: false,
    partner_offers: false,
  };
  for (const row of data ?? []) {
    const cat = row.category as EmailCategory;
    if (ALL_EMAIL_CATEGORIES.includes(cat)) {
      state[cat] = !row.unsubscribed_at;
    }
  }
  return state;
}

/**
 * Suppression check before queueing a marketing send. Returns true if the
 * recipient is allowed to receive this category.
 */
export async function isSubscribedTo(email: string, category: EmailCategory): Promise<boolean> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("email_subscriptions")
    .select("unsubscribed_at")
    .eq("email", email.toLowerCase().trim())
    .eq("category", category)
    .maybeSingle();
  if (!data) return false;
  return data.unsubscribed_at == null;
}

/**
 * Get-or-create a stable, non-guessable unsubscribe token for this email.
 * Embedded in marketing emails as `?token=...` on the unsubscribe link so
 * recipients can opt out without logging in (CAN-SPAM requirement).
 */
export async function getOrCreateUnsubscribeToken(email: string): Promise<string> {
  const admin = createServiceClient();
  const normalized = email.toLowerCase().trim();

  const { data: existing } = await admin
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalized)
    .maybeSingle();
  if (existing?.token) return existing.token;

  const token = crypto.randomBytes(32).toString("base64url");
  const { error } = await admin
    .from("email_unsubscribe_tokens")
    .insert({ email: normalized, token });
  if (error) {
    // Race: another caller minted at the same time. Re-read.
    const { data: retry } = await admin
      .from("email_unsubscribe_tokens")
      .select("token")
      .eq("email", normalized)
      .maybeSingle();
    if (retry?.token) return retry.token;
    throw error;
  }
  return token;
}

/**
 * Look up the email associated with an unsubscribe token. Returns null if
 * the token doesn't exist (expired/invalid links should land on a generic
 * "this link isn't valid" page, not crash).
 */
export async function findEmailForUnsubscribeToken(token: string): Promise<string | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("email_unsubscribe_tokens")
    .select("email")
    .eq("token", token)
    .maybeSingle();
  return (data?.email as string | undefined) ?? null;
}
