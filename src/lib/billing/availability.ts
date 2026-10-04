import "server-only";

/**
 * Who can buy what, right now. Decisions: specs/monetization-launch-plan.md
 * and specs/international-payments-plan.md (Oct 2, 2026).
 *
 *   * Paid plans (GS Pro, and Circuit once billing is on) are US-only for
 *     now: GameShuffle collects US sales tax but isn't set up for EU/UK VAT,
 *     which applies from a buyer's first purchase. Everyone else keeps the
 *     whole free site and can join a waitlist.
 *   * Paid event entry is switched off until the tax and organizer-agreement
 *     questions are answered (`paid_tickets_enabled`, off when the row is
 *     missing).
 *
 * The pre-checkout gate reads the visitor's IP country. It's a courtesy, not
 * the evidence: the billing address on the Stripe session is, and the
 * webhook cancels and refunds anything that comes back non-US.
 */

import { getPlatformFlag } from "@/lib/platform/flags";

export const PAID_PLAN_COUNTRIES = new Set(["US"]);

/** Two-letter country from the edge headers, or null (local dev, unknown). */
export function countryFromRequest(request: Request): string | null {
  const h = request.headers;
  const raw = h.get("x-vercel-ip-country") || h.get("cf-ipcountry") || "";
  const code = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) && code !== "XX" && code !== "T1" ? code : null;
}

export interface PaidPlanAvailability {
  available: boolean;
  country: string | null;
}

/** Can this visitor start a paid-plan checkout? Unknown country is allowed (the webhook backstops it). */
export function paidPlanAvailability(request: Request): PaidPlanAvailability {
  const country = countryFromRequest(request);
  return { available: !country || PAID_PLAN_COUNTRIES.has(country), country };
}

/** Is a billing country one we sell paid plans to? Missing is treated as yes (nothing to act on). */
export function isPaidPlanCountry(country: string | null | undefined): boolean {
  return !country || PAID_PLAN_COUNTRIES.has(country.toUpperCase());
}

/** Paid event entry (ticket tiers above $0, Connect payouts). Off until switched on in Platform Admin. */
export function paidTicketsEnabled(): Promise<boolean> {
  return getPlatformFlag("paid_tickets_enabled", false);
}

export class PaidEntryPaused extends Error {
  constructor() { super("paid_entry_paused"); }
}
