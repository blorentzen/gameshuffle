"use client";

import { useEffect, useState } from "react";

export interface PaidAvailability {
  /** Can this visitor start a paid-plan checkout (US-only for now)? */
  paidPlans: { available: boolean; country: string | null };
  /** Is paid event entry switched on? */
  paidEntry: boolean;
}

// Unknown counts as available, as on the server: checkout itself refuses outside the US.
const UNKNOWN: PaidAvailability = { paidPlans: { available: true, country: null }, paidEntry: false };

// One lookup per page load, shared by every offer on the page (a wall's terms line and its buttons both ask).
let lookup: Promise<PaidAvailability> | null = null;
function load(): Promise<PaidAvailability> {
  lookup ??= fetch("/api/billing/availability", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j as PaidAvailability | null) ?? UNKNOWN)
    .catch(() => UNKNOWN);
  return lookup;
}

/** Billing availability for this visitor. Null while loading. */
export function usePaidAvailability(): PaidAvailability | null {
  const [state, setState] = useState<PaidAvailability | null>(null);
  useEffect(() => {
    let active = true;
    void load().then((v) => { if (active) setState(v); });
    return () => { active = false; };
  }, []);
  return state;
}
