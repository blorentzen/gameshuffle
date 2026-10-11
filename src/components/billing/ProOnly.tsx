"use client";

import type { ReactNode } from "react";
import { useTrialEligibility } from "@/components/billing/useTrialEligibility";

/**
 * Shows `children` to GS Pro accounts and `fallback` (usually a
 * ProTrialPrompt) to everyone else; nothing while it's still checking. Copy
 * and controls only: the save routes enforce the same rule on the server.
 */
export function ProOnly({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const who = useTrialEligibility();
  if (!who) return null;
  return <>{who.isPro ? children : fallback}</>;
}
