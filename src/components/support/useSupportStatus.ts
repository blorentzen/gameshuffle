"use client";

import { useEffect, useState } from "react";
import type { SupportLevel } from "@/lib/support/rules";

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
  /** GS Pro from a plan, a trial or Circuit 256 (so a level with GS Pro would charge twice). */
  proElsewhere: boolean;
  /** Their live monthly level. */
  level: SupportLevel | null;
  /** Their Founding supporter number, or null. */
  founding: number | null;
  monthly: { amountCents: number; status: string; cancelAtPeriodEnd: boolean; renewsAt: string | null; level: SupportLevel } | null;
  progress: { goalCents: number; raisedCents: number } | null;
  supportersThisMonth: number;
  /** May use looks: GS Pro, or support sold with them. */
  looks?: boolean;
  /** The $3 Supporter level sells looks right now. */
  supporterLooks?: boolean;
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

/** The same, plus whether the lookup has finished (a failed lookup finishes with null). */
export function useSupportLookup(): { status: SupportStatus | null; done: boolean } {
  const [state, setState] = useState<{ status: SupportStatus | null; done: boolean }>({ status: null, done: false });
  useEffect(() => {
    let active = true;
    void load().then((v) => { if (active) setState({ status: v, done: true }); });
    return () => { active = false; };
  }, []);
  return state;
}
