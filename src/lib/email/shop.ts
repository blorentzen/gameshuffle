/**
 * GameShuffle Shop emails, from docs/specs/shop/shop-copy.md (tracked versions
 * only: every order ships by USPS Ground Advantage since 2026-10-09). Sent as
 * "GameShuffle Shop" from noreply@, replies to the shop's support address.
 * Plain text, like the other transactional emails. Outside production they
 * only log (sendTransactionalEmail's guard).
 */

import { sendTransactionalEmail } from "./mailersend";
import { SHOP } from "@/lib/store/config";
import { formatPrice, shopCopy } from "@/lib/store/copy";
import { getBaseUrl } from "@/lib/env";

const FROM_NAME = "GameShuffle Shop";

export interface ShopEmailItem { name: string; quantity: number; contents: string[]; unitAmount: number }

function footer(): string {
  return `Questions? Reply to this email. · Shipping, returns and card condition: ${getBaseUrl()}/shop/policies`;
}

function itemLines(items: ShopEmailItem[]): string[] {
  return items.flatMap((i) => [
    `${i.quantity > 1 ? `${i.quantity} x ` : ""}${i.name}`,
    ...i.contents.map((c) => `  - ${c}`),
  ]);
}

/** 1. Order received (tracked). */
export async function sendShopOrderReceived(args: {
  to: string; orderCode: string; items: ShopEmailItem[]; shipBy: string; afterCutoff: boolean;
  name: string | null; city: string | null; state: string | null;
}) {
  const text = [
    "Thanks for your order. Here's what's coming:",
    "",
    ...itemLines(args.items),
    "",
    `We'll ship it within ${SHOP.shipping.ship_within_business_days} business days, by ${args.shipBy}, and send a tracking link when it's on the way.`,
    ...(args.afterCutoff ? ["This order will arrive after Christmas."] : []),
    "",
    `Shipping to: ${[args.name, args.city, args.state].filter(Boolean).join(", ")}`,
    "",
    footer(),
  ].join("\n");
  return sendTransactionalEmail({ to: args.to, toName: args.name ?? undefined, subject: `Order ${args.orderCode} is in`, text, fromName: FROM_NAME, replyTo: SHOP.contact.support_email });
}

/** 6. New order alert (to Britton). */
export async function sendShopNewOrderAlert(args: {
  orderCode: string; items: ShopEmailItem[]; totalCents: number; shipMethodLabel: string;
  name: string | null; city: string | null; state: string | null; shortfall?: { sku: string; missing: number }[] | null;
}) {
  const items = args.items.map((i) => `${i.quantity} x ${i.name}`).join(", ");
  const text = [
    `${items}, ${formatPrice(args.totalCents)}, ship to ${[args.name, args.city, args.state].filter(Boolean).join(", ")}.`,
    ...(args.shortfall?.length ? ["", `Stock ran short: ${args.shortfall.map((s) => `${s.sku} (${s.missing} missing)`).join(", ")}. Check the shelf before shipping.`] : []),
    "",
    `Open the admin: ${getBaseUrl()}/account/platform?tab=platform-shop-orders`,
  ].join("\n");
  return sendTransactionalEmail({
    to: SHOP.contact.alert_email,
    subject: `New shop order ${args.orderCode}: ${args.shipMethodLabel}, ${args.state ?? "no state"}`,
    text,
    fromName: FROM_NAME,
  });
}

/** An order to an address we can't ship to (APO/FPO/DPO or outside the 50 states and DC): refunded in full. */
export async function sendShopCantShip(args: { to: string; orderCode: string; name: string | null }) {
  const copy = shopCopy();
  const text = [
    copy.errors.military,
    "",
    `We've refunded order ${args.orderCode} in full. It can take 5 to 10 business days to show on your statement.`,
    "",
    footer(),
  ].join("\n");
  return sendTransactionalEmail({ to: args.to, toName: args.name ?? undefined, subject: `We couldn't ship order ${args.orderCode}`, text, fromName: FROM_NAME, replyTo: SHOP.contact.support_email });
}
