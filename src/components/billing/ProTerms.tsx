"use client";

import { usePaidAvailability } from "@/components/billing/usePaidAvailability";
import { usePublicPricing } from "@/lib/pricing/usePublicPricing";
import { usd } from "@/lib/pricing/publicTypes";

/**
 * The one line above a GS Pro offer's buttons: the trial and price while the account still has
 * its trial, "upgrade any time" once it's used, and nothing outside the US, where the buttons
 * become the waitlist (and before we know where the visitor is). The price comes from the
 * price list, never typed in.
 */
export function ProTerms({ hasUsedTrial, className, reassure = false }: {
  hasUsedTrial?: boolean;
  className?: string;
  /** Adds "and you won't be charged" to the trial line. */
  reassure?: boolean;
}) {
  const availability = usePaidAvailability();
  const pricing = usePublicPricing();
  if (!availability?.paidPlans.available) return null;
  const monthly = pricing.plans.pro?.monthly ?? 9;
  return (
    <p className={className}>
      {hasUsedTrial
        ? "Upgrade any time, and cancel whenever you like."
        : `14 days free, then ${usd(monthly)} a month. Cancel any time before it ends${reassure ? " and you won't be charged" : ""}.`}
    </p>
  );
}
