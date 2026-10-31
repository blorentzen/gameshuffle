"use client";

import type { ReactNode } from "react";
import { usePaidAvailability } from "@/components/billing/usePaidAvailability";
import { useTrialEligibility } from "@/components/billing/useTrialEligibility";

/**
 * Trial wording on marketing rows that only holds for some visitors (audit, 2026-10-19): the page
 * renders `trial` ("14 days free"), and once the browser knows, a visitor outside the US sees
 * `outside` and someone whose trial is used (or who has GS Pro) sees `otherwise`.
 */
export function TrialNote({ trial, otherwise = null, outside = null }: { trial: ReactNode; otherwise?: ReactNode; outside?: ReactNode }) {
  const availability = usePaidAvailability();
  const who = useTrialEligibility();
  if (availability && !availability.paidPlans.available) return <>{outside}</>;
  if (who?.hasUsedTrial || who?.isPro) return <>{otherwise}</>;
  return <>{trial}</>;
}
