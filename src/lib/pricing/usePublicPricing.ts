"use client";

import { useEffect, useState } from "react";
import { DEFAULT_PUBLIC_PRICING, type PublicPricing } from "./publicTypes";

/**
 * Client hook for the public pricing snapshot. Renders the code defaults on
 * the first paint (same numbers as before the lever model) and swaps in the
 * catalog amounts once /api/pricing answers, so price edits reach marketing
 * and account surfaces without a deploy.
 */
export function usePublicPricing(): PublicPricing {
  const [pricing, setPricing] = useState<PublicPricing>(DEFAULT_PUBLIC_PRICING);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/pricing").then((r) => (r.ok ? r.json() : null)).then((j: PublicPricing | null) => { if (!cancelled && j) setPricing(j); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return pricing;
}
