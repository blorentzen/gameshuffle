/** Client-safe shape of the public pricing snapshot served by /api/pricing. */

export interface PlanAmounts { monthly: number | null; annual: number | null; once?: number | null }

export interface PublicPricing {
  source: "catalog" | "constants";
  plans: Partial<Record<string, PlanAmounts>>;
  /** Platform fee on paid tickets by organizer plan. */
  platformFee: Partial<Record<string, { bps: number; fixedCents: number }>>;
  smsSegments: Partial<Record<string, number>>;
  processing: { bps: number; fixedCents: number };
}

export const DEFAULT_PUBLIC_PRICING: PublicPricing = {
  source: "constants",
  plans: {
    pro: { monthly: 9, annual: 99 },
    pro_addon: { monthly: 5, annual: 50 },
    circuit_64: { monthly: 12, annual: 120 },
    circuit_256: { monthly: 29, annual: 290 },
    circuit_events: { monthly: null, annual: null, once: 500 },
  },
  platformFee: {
    free: { bps: 500, fixedCents: 25 }, pro: { bps: 500, fixedCents: 25 }, circuit_64: { bps: 250, fixedCents: 25 }, circuit_256: { bps: 0, fixedCents: 0 }, circuit_events: { bps: 0, fixedCents: 0 },
  },
  smsSegments: { free: 0, pro: 0, circuit_64: 500, circuit_256: 2000 },
  processing: { bps: 290, fixedCents: 30 },
};

/** "$9" / "$9.50" formatting for marketing surfaces. */
export function usd(amount: number | null | undefined): string {
  if (amount == null) return "";
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}
