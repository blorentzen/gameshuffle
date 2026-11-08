/**
 * Shared words for the staff order screens (Admin ▸ Shop ▸ Orders, the queue and each order's page): status badges,
 * error messages, Printful's state in a line, timeline entries and times in Pacific.
 */

import type { AdminOrderDetail, AdminOrderRow } from "@/lib/store/manage";

export const STATUS: Record<AdminOrderRow["status"], { label: string; variant: "warning" | "success" | "default" | "info" }> = {
  paid: { label: "To ship", variant: "warning" },
  shipped: { label: "Shipped", variant: "success" },
  refunded: { label: "Refunded", variant: "default" },
  canceled: { label: "Canceled", variant: "default" },
};
const ERRORS: Record<string, string> = {
  bad_tracking: "That doesn't look like a tracking number.", not_shippable: "Only unshipped orders can be marked shipped.",
  not_refundable: "This order can't be refunded.", already_restocked: "Already back in stock.", never_taken: "This order never took stock.",
  empty_note: "Write the note first.", no_email: "This order has no email.", live_locked: "Live mode is locked. An admin can turn on \"Edit products in Stripe live mode\" on the Switches screen.",
  bad_sku: "SKU: lowercase letters, numbers and dashes.", sku_taken: "That SKU is taken.", bad_price: "Price must be $0.50 to $1,000.",
  bad_name: "Add a name.", missing_fields: "Add a name and a price.", bad_max: "Max per order is 1 to 20.", bad_weight: "Weight must be above 0.",
  bad_stock: "Stock must be a whole number, 0 or more.", bad_image: "Image link must start with https:// or /images/.",
  nothing_to_refund: "Pick something to refund.", too_much: "That's more than is left to refund.", bad_amount: "Enter an amount above $0.",
  too_many_items: "That's more units than are left to refund.", shipping_refunded: "Shipping was already refunded.",
  stripe_failed: "Stripe didn't take the refund. Nothing was refunded; try again.", refund_failed: "The refund didn't go through. Nothing was refunded.",
  no_payment: "This order has no payment to refund.",
  test_order: "Test orders never go to Printful.", not_paid: "Only paid orders can go to Printful.",
};
/** Where a merch order stands with Printful, in a line. */
export const PRINTFUL_LINE: Record<string, string> = {
  creating: "Making the Printful draft…",
  draft: "Waiting in Printful as a draft. Nothing is charged until you send it.",
  pending: "Sent to Printful. Waiting for Printful to accept it.",
  inreview: "Printful is reviewing it.",
  inprocess: "Printful is making it.",
  onhold: "On hold at Printful. Open Printful to sort it out.",
  partial: "Printful shipped part of it.",
  fulfilled: "Printful shipped it.",
  failed: "Printful didn't take it.",
  canceled: "Canceled at Printful.",
  test: "Test order: Printful priced it, and nothing was made there.",
};
export const errorText = (code?: string) => ERRORS[code ?? ""] ?? "That didn't work.";
export const EVENT_STATUS: Record<string, "primary" | "success" | "warning" | "info" | "default"> = { placed: "primary", shipped: "success", refunded: "warning", canceled: "warning", restocked: "info", reshipped: "info" };
export function eventDetail(e: AdminOrderDetail["timeline"][number]): string {
  const d = e.detail;
  if (e.kind === "note" && typeof d.text === "string") return d.text;
  if ((e.kind === "shipped" || e.kind === "updated") && typeof d.tracking === "string") return `Tracking ${d.tracking}`;
  if (e.kind === "restocked" && typeof d.units === "number") return `${d.units} back in stock`;
  if (e.kind === "refunded" && typeof d.reason === "string") return d.reason;
  if (e.kind === "email" && d.what === "confirmation_resent") return "Confirmation sent again";
  if (e.kind === "request" && typeof d.line === "string") return d.line;
  if (e.kind === "request_resolved" && typeof d.resolution === "string") return `Closed: ${d.resolution.replace(/_/g, " ")}`;
  if (e.kind === "late" && typeof d.due === "string") return `Was due to ship ${d.due}; the buyer was emailed`;
  if (e.kind === "returned") return "Printful says a box came back; the buyer was emailed";
  if (e.kind === "delivered") return "The buyer was emailed";
  if (e.kind === "reprinted" && d.printful_order_id) return `Printful order ${d.printful_order_id}`;
  return "";
}
export const when = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

