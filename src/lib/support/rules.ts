/**
 * Support GameShuffle, the rules (pure, client-safe). Britton's picks,
 * 2026-10-16 (https://claude.ai/artifact/Aq45TevdtaE5nqiUhFJNSz): give once
 * or monthly through Stripe, $3, $5, $10 or $25 or any other amount; a
 * Supporter badge and an opt-in supporters wall; a monthly goal bar; US only
 * to start, like GS Pro. GameShuffle isn't a charity, so support is never
 * called tax-deductible, and it never pays out tokens.
 */

/** The preset amounts, in cents ($5 is picked to start). */
export const SUPPORT_AMOUNTS = [300, 500, 1000, 2500] as const;
export const SUPPORT_DEFAULT = 500;
/** $3 is the least: Stripe keeps about 2.9% + 30¢ of every payment. */
export const SUPPORT_MIN_CENTS = 300;
export const SUPPORT_MAX_CENTS = 100_000;
/** How long a one-time gift keeps the Supporter badge. */
export const SUPPORTER_BADGE_DAYS = 365;
export const WALL_NAME_MAX = 40;
export const WALL_NOTE_MAX = 140;

export type SupportKind = "once" | "monthly";

/** Whole dollars from a typed amount ("7", "$12.50" → 1250), or null when it isn't a number. */
export function centsFromInput(raw: string): number | null {
  const n = Number(raw.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/** Why an amount can't be used, or null when it's fine. */
export function amountProblem(cents: number | null): string | null {
  if (cents === null) return "Enter an amount in dollars.";
  if (cents < SUPPORT_MIN_CENTS) return `The smallest amount is $${SUPPORT_MIN_CENTS / 100}.`;
  if (cents > SUPPORT_MAX_CENTS) return `For more than $${(SUPPORT_MAX_CENTS / 100).toLocaleString("en-US")}, email support@gameshuffle.co.`;
  return null;
}

export const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** A wall name or note, tidied and cut to length (word checks happen on the server). */
export function tidyWall(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/\s+/g, " ").trim().slice(0, max);
  return s.length ? s : null;
}

/** One line of what the month costs, set by staff. */
export interface SupportCost { label: string; cents: number }

/** How much of the month's goal support covers, 0 to 100. */
export function goalPercent(raisedCents: number, goalCents: number): number {
  if (goalCents <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((raisedCents / goalCents) * 100)));
}
