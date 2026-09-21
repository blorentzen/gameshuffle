import "server-only";

/**
 * Load an account's billing state in the shape the plan-change resolver needs,
 * plus display labels for the billing UI. Server-only (service role).
 *
 * This is read-only. Executing a plan change is a separate, gated step (see
 * Phase C — pauses before live Stripe ops).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import { getProAccess } from "@/lib/subscription-server";
import { resolveIntervalFromPrice } from "@/lib/stripe/client";
import { planFromStripePrice } from "@/lib/pricing/catalog";
import type { AccountPlanState, Interval, CircuitPaidTier } from "@/lib/billing/planChange";
import type { ProSource } from "@/lib/subscription";

const PRO_SOURCE_LABEL: Record<ProSource, string> = {
  circuit_256: "Included with Circuit 256",
  pro_addon: "Circuit add-on",
  pro_subscription: "GameShuffle Pro",
  pro_trial: "GameShuffle Pro (trial)",
};

export interface AccountBilling {
  /** For the resolver. */
  state: AccountPlanState;
  /** For the UI. */
  display: {
    hasPro: boolean;
    proSourceLabel: string | null;
    proEndsAt: string | null;
    circuitTier: CircuitPaidTier | null;
    circuitRenewal: string | null;
    proRenewal: string | null;
  };
}

const ACTIVE = new Set(["trialing", "active", "past_due"]);

export async function getAccountBilling(
  userId: string,
  admin: SupabaseClient = createServiceClient(),
): Promise<AccountBilling> {
  const [access, subsRes, userRes] = await Promise.all([
    getProAccess(userId, admin),
    admin
      .from("subscriptions")
      .select("product, status, tier, price_id, current_period_end, trial_end")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    admin.from("users").select("circuit_tier, circuit_status").eq("id", userId).maybeSingle(),
  ]);

  const rows = (subsRes.data ?? []) as {
    product: string | null;
    status: string | null;
    tier: string | null;
    price_id: string | null;
    current_period_end: string | null;
    trial_end: string | null;
  }[];
  const proRow = rows.find((r) => (r.product ?? "pro") === "pro" && ACTIVE.has(r.status ?? ""));
  const circuitRow = rows.find((r) => r.product === "circuit" && ACTIVE.has(r.status ?? ""));
  // Interval by lookup key (lever model), legacy env ids as fallback.
  const intervalOf = async (priceId: string | null | undefined): Promise<Interval> => {
    const r = await planFromStripePrice(priceId).catch(() => null);
    if (r?.interval === "month") return "monthly";
    if (r?.interval === "year") return "annual";
    return (resolveIntervalFromPrice(priceId) ?? "monthly") as Interval;
  };
  const [proInterval, circuitInterval] = await Promise.all([intervalOf(proRow?.price_id), intervalOf(circuitRow?.price_id)]);
  const u = (userRes.data ?? null) as { circuit_tier: string | null; circuit_status: string | null } | null;

  // Standalone Pro state (only when Pro comes from a standalone sub/trial, not
  // from Circuit — the resolver models those on the circuit axis).
  const proStandalone =
    proRow && (access.source === "pro_subscription" || access.source === "pro_trial")
      ? {
          status: (proRow.status === "trialing" ? "trial" : "active") as "trial" | "active",
          interval: proInterval,
        }
      : null;

  const circuitTier = (u?.circuit_tier === "circuit_64" || u?.circuit_tier === "circuit_256"
    ? u.circuit_tier
    : null) as CircuitPaidTier | null;
  const circuit =
    circuitTier && ACTIVE.has(u?.circuit_status ?? "")
      ? {
          tier: circuitTier,
          interval: circuitInterval,
          // Multi-item add-on detection lands with the billing phase; false today.
          proAddon: access.source === "pro_addon",
        }
      : null;

  return {
    state: { proStandalone, circuit },
    display: {
      hasPro: access.hasPro,
      proSourceLabel: access.source && access.source in PRO_SOURCE_LABEL
        ? PRO_SOURCE_LABEL[access.source as ProSource]
        : access.source === "staff" || access.source === "beta"
          ? "Included with your role"
          : null,
      proEndsAt: access.endsAt ? access.endsAt.toISOString() : null,
      circuitTier,
      circuitRenewal: circuitRow?.current_period_end ?? null,
      proRenewal: proRow?.current_period_end ?? proRow?.trial_end ?? null,
    },
  };
}
