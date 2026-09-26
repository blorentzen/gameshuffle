import "server-only";

import { getCatalog, type PlanId } from "./catalog";
import { PRO_STANDALONE_PRICE, PRO_ADDON_PRICE, CIRCUIT_TIERS } from "@/lib/tournaments/circuit";
import { DEFAULT_PUBLIC_PRICING, type PublicPricing } from "./publicTypes";

/**
 * Public pricing snapshot (USD amounts per plan + the fee levers buyers see).
 * Table-backed; the code constants are the fallback so pre-migration
 * environments render the same numbers they always did.
 */
export async function getPublicPricing(): Promise<PublicPricing> {
  const out: PublicPricing = JSON.parse(JSON.stringify(DEFAULT_PUBLIC_PRICING));
  // Keep the constants as the baseline so any missing row falls back cleanly.
  out.plans.pro = { monthly: PRO_STANDALONE_PRICE.monthlyUsd, annual: PRO_STANDALONE_PRICE.annualUsd };
  out.plans.pro_addon = { monthly: PRO_ADDON_PRICE.monthlyUsd, annual: PRO_ADDON_PRICE.annualUsd };
  for (const t of CIRCUIT_TIERS) if (t.price && t.price !== "quoted") out.plans[t.id as PlanId] = { monthly: t.price.monthlyUsd, annual: t.price.annualUsd };
  try {
    const c = await getCatalog();
    for (const p of c.prices) {
      if (!p.active || p.supersededBy) continue;
      const plan = (out.plans[p.planId] ??= { monthly: null, annual: null });
      if (p.interval === "month") plan.monthly = p.amountCents / 100;
      else if (p.interval === "year") plan.annual = p.amountCents / 100;
      else plan.once = p.amountCents / 100;
    }
    for (const planId of ["free", "pro", "circuit_64", "circuit_256", "circuit_events"] as PlanId[]) {
      out.platformFee[planId] = {
        bps: c.levers.get(`platform_fee_bps.${planId}`)?.valueNum ?? out.platformFee[planId]?.bps ?? 0,
        fixedCents: c.levers.get(`platform_fee_fixed_cents.${planId}`)?.valueNum ?? out.platformFee[planId]?.fixedCents ?? 0,
      };
      out.smsSegments[planId] = c.levers.get(`sms_segments.${planId}`)?.valueNum ?? out.smsSegments[planId] ?? 0;
    }
    out.processing = { bps: c.levers.get("processing_fee_bps")?.valueNum ?? 290, fixedCents: c.levers.get("processing_fee_fixed_cents")?.valueNum ?? 30 };
    out.source = "catalog";
  } catch {
    out.source = "constants";
  }
  return out;
}
