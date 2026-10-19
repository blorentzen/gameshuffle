"use client";

import { useEffect, useState } from "react";

/** /api/support/status: who's looking, for every Support ask and thank-you. */
export interface SupportStatus {
  /** Support can be given from here (US only for now). */
  available: boolean;
  signedIn: boolean;
  /** Gave in the last year, or gives monthly. */
  supporter: boolean;
  /** The first time they gave (ISO). */
  since: string | null;
  /** Their display name, for the thank-you line. */
  name: string | null;
  pro: boolean;
  monthly: { amountCents: number; status: string; cancelAtPeriodEnd: boolean; renewsAt: string | null } | null;
  progress: { goalCents: number; raisedCents: number } | null;
  supportersThisMonth: number;
}

// One lookup per page load, shared by every ask and thank-you on the page.
let lookup: Promise<SupportStatus | null> | null = null;
function load(): Promise<SupportStatus | null> {
  lookup ??= fetch("/api/support/status", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<SupportStatus>) : null))
    .catch(() => null);
  return lookup;
}

/** The visitor's support status. Null while loading (or if it couldn't be read: then no asks). */
export function useSupportStatus(): SupportStatus | null {
  const [state, setState] = useState<SupportStatus | null>(null);
  useEffect(() => {
    let active = true;
    void load().then((v) => { if (active) setState(v); });
    return () => { active = false; };
  }, []);
  return state;
}
