"use client";

import { useEffect, useState } from "react";

export interface PaidAvailability {
  /** Can this visitor start a paid-plan checkout (US-only for now)? */
  paidPlans: { available: boolean; country: string | null };
  /** Is paid event entry switched on? */
  paidEntry: boolean;
}

/** Billing availability for this visitor. Null while loading. */
export function usePaidAvailability(): PaidAvailability | null {
  const [state, setState] = useState<PaidAvailability | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/billing/availability", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (active && j) setState(j as PaidAvailability); })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  return state;
}
