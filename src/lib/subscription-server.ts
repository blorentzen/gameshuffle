import "server-only";

/**
 * Server-side Pro access resolution — the async companion to the pure model in
 * `subscription.ts`. `getProAccess(userId)` is the one place that reads an
 * account's billing state and reports whether the user has GameShuffle Pro,
 * from which source, and until when.
 *
 * Pro sources (see specs/gs-circuit-pro-addendum.md):
 *   pro_subscription · pro_trial · circuit_256 (bundle) · pro_addon (on Circuit 64)
 * plus the operational staff/beta grants.
 *
 * Preview note: this is deliberately independent of `organizer_billing_enabled`.
 * While Circuit is in preview, Circuit *features* are free for everyone, but Pro
 * still requires a real Pro source here (Decision 7) — no user gets Pro just
 * because Circuit is free in preview.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  proAccessFromState,
  effectiveTier,
  normalizeTier,
  type ProAccess,
  type ProAccessState,
  type CapabilityUser,
} from "@/lib/subscription";

/** The account fields the Pro resolver needs, loaded once. */
export interface ProUser extends ProAccessState {
  id: string;
}

/**
 * Load the standard Pro-relevant fields for a user in one query. Replaces the
 * repeated "select subscription_tier, role, … then normalize" boilerplate that
 * was duplicated across every Twitch command and Discord route.
 */
export async function resolveProUser(
  userId: string,
  admin: SupabaseClient = createServiceClient(),
): Promise<ProUser | null> {
  const { data } = await admin
    .from("users")
    .select("id, subscription_tier, subscription_status, role, circuit_tier, circuit_status")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  const row = data as {
    id: string;
    subscription_tier: string | null;
    subscription_status: string | null;
    role: string | null;
    circuit_tier: string | null;
    circuit_status: string | null;
  };
  return {
    id: row.id,
    subscriptionTier: row.subscription_tier,
    subscriptionStatus: row.subscription_status,
    role: row.role,
    circuitTier: row.circuit_tier,
    circuitStatus: row.circuit_status,
    // hasProAddon comes from multi-item subscription detection, wired in a
    // later billing phase; false until then.
    hasProAddon: false,
  };
}

/** Build the `CapabilityUser` shape (for `effectiveTier`/`hasCapability`) from a
 *  loaded ProUser, so capability checks honor the Circuit→Pro bundle. */
export function capabilityUserFromProUser(user: ProUser): CapabilityUser {
  return {
    tier: normalizeTier(user.subscriptionTier ?? null),
    role: user.role,
    circuitTier: user.circuitTier,
    circuitStatus: user.circuitStatus,
    hasProAddon: user.hasProAddon,
  };
}

/**
 * Load a user's `CapabilityUser` (Circuit-aware) in one query. Use this in
 * place of the old "select subscription_tier, role → effectiveTier" boilerplate
 * so every capability check honors the Circuit→Pro bundle. Does NOT resolve
 * staff impersonation (no request context) — request-scoped gates that support
 * "view as" keep building their own CapabilityUser with `viewingAsTier`.
 */
export async function getCapabilityUser(
  userId: string,
  admin: SupabaseClient = createServiceClient(),
): Promise<CapabilityUser | null> {
  const user = await resolveProUser(userId, admin);
  return user ? capabilityUserFromProUser(user) : null;
}

/**
 * One-query Pro gate for non-impersonation call sites (chat commands, Discord
 * routes, crons): `effectiveTier(capabilityUser) === "pro"`, Circuit-aware.
 * A missing user resolves to not-Pro. For source/dedupe/endsAt details use
 * `getProAccess`.
 */
export async function isProUser(
  userId: string,
  admin: SupabaseClient = createServiceClient(),
): Promise<boolean> {
  const capUser = await getCapabilityUser(userId, admin);
  return capUser ? effectiveTier(capUser) === "pro" : false;
}

/**
 * The canonical Pro access check. Reads account + subscription state and
 * returns `{ hasPro, source, sources, endsAt }`. Enriches `endsAt` with the
 * period-end / trial-end dates from the `subscriptions` mirror when present.
 */
export async function getProAccess(
  userId: string,
  admin: SupabaseClient = createServiceClient(),
): Promise<ProAccess> {
  const user = await resolveProUser(userId, admin);
  if (!user) return { hasPro: false, source: null, sources: [], endsAt: null };

  // Pull period-end dates from the subscription mirror to populate `endsAt`.
  const { data: subs } = await admin
    .from("subscriptions")
    .select("product, status, current_period_end, trial_end")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  const rows = (subs ?? []) as {
    product: string | null;
    status: string | null;
    current_period_end: string | null;
    trial_end: string | null;
  }[];
  const pro = rows.find((r) => (r.product ?? "pro") === "pro");
  const circuit = rows.find((r) => r.product === "circuit");

  return proAccessFromState({
    subscriptionTier: user.subscriptionTier,
    subscriptionStatus: user.subscriptionStatus,
    role: user.role,
    circuitTier: user.circuitTier,
    circuitStatus: user.circuitStatus,
    hasProAddon: user.hasProAddon,
    proPeriodEnd: pro?.current_period_end ?? null,
    trialEnd: pro?.trial_end ?? null,
    circuitPeriodEnd: circuit?.current_period_end ?? null,
  });
}

/** Convenience boolean for gates that just need yes/no. */
export async function hasProAccess(
  userId: string,
  admin: SupabaseClient = createServiceClient(),
): Promise<boolean> {
  return (await getProAccess(userId, admin)).hasPro;
}
