/**
 * Refund terms in plain words, shared by the checkout card and the confirmation
 * email so a buyer is never told two different things about the same purchase.
 * Pure and client-safe: no server imports.
 */

export interface RefundTermsInput {
  refundPolicy: "none" | "until_days_before" | "always";
  refundDaysBefore: number;
  feePayer: "buyer" | "organizer";
  feesRefundable: boolean;
  feeCents: number;
}

export function refundTermsText(t: RefundTermsInput): string {
  const fees = t.feePayer === "buyer" && !t.feesRefundable && t.feeCents > 0
    ? " Fees aren't refunded unless the event is cancelled."
    : "";
  if (t.refundPolicy === "none") return `All sales are final.${fees}`;
  if (t.refundPolicy === "always") return `Refundable any time before the event.${fees}`;
  const d = t.refundDaysBefore;
  return `Refundable until ${d === 1 ? "a day" : `${d} days`} before the event.${fees}`;
}
