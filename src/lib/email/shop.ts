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

export const uspsTrackingUrl = (tracking: string) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(tracking)}`;
const viewLine = (viewUrl?: string | null) => (viewUrl ? [`View your order: ${viewUrl}`, ""] : []);
const absolute = (url: string) => (url.startsWith("/") ? `${getBaseUrl()}${url}` : url);

/** The order's digital lists (checklists, deck lists), only those with a page to link to. */
function listLines(lists?: { title: string; url: string }[] | null): string[] {
  if (!lists?.length) return [];
  return ["Your digital lists:", ...lists.map((l) => `  - ${l.title}: ${absolute(l.url)}`), ""];
}

/** Where to see this order in a GameShuffle account (Britton, 2026-10-09): the account's My Stuff, or a free signup with this email. NEW copy. */
export function shopAccountUrl(member: boolean): string {
  return member ? `${getBaseUrl()}/account/stuff?tab=orders` : `${getBaseUrl()}/signup?redirect=${encodeURIComponent("/account/stuff?tab=orders")}`;
}
function accountLines(account?: { member: boolean } | null): string[] {
  if (!account) return [];
  return account.member
    ? [`This order is also in your GameShuffle account, under My Stuff: ${shopAccountUrl(true)}`, ""]
    : ["Track every order in one place: make a free GameShuffle account with this email address and your orders show up under My Stuff.", shopAccountUrl(false), ""];
}

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
  name: string | null; city: string | null; state: string | null; viewUrl?: string | null;
  digitalLists?: { title: string; url: string }[] | null; account?: { member: boolean } | null;
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
    ...listLines(args.digitalLists),
    ...viewLine(args.viewUrl),
    ...accountLines(args.account),
    footer(),
  ].join("\n");
  return sendTransactionalEmail({ to: args.to, toName: args.name ?? undefined, subject: `Order ${args.orderCode} is in`, text, fromName: FROM_NAME, replyTo: SHOP.contact.support_email });
}

/** 3. Shipped (tracked). */
export async function sendShopShipped(args: { to: string; orderCode: string; tracking: string; name: string | null; viewUrl?: string | null }) {
  const est = SHOP.checkout.shipping_estimate_business_days;
  const text = [
    "Your packs are on the way by USPS Ground Advantage.",
    `Track it: ${uspsTrackingUrl(args.tracking)}`,
    `Most orders arrive in ${est.min} to ${est.max} business days.`,
    "",
    ...viewLine(args.viewUrl),
    footer(),
  ].join("\n");
  return sendTransactionalEmail({ to: args.to, toName: args.name ?? undefined, subject: `Order ${args.orderCode} shipped`, text, fromName: FROM_NAME, replyTo: SHOP.contact.support_email });
}

/**
 * A refund, from the admin or the Stripe Dashboard (NEW copy, Britton approved 2026-10-09). Sent once per
 * refund. A full refund says so; a partial one lists what came back (items, shipping) and why.
 */
export async function sendShopRefunded(args: {
  to: string; orderCode: string; amountCents: number; name: string | null; viewUrl?: string | null;
  full?: boolean; items?: { name: string; quantity: number }[]; shipping?: boolean; reason?: string | null;
}) {
  const amount = formatPrice(args.amountCents);
  const what = [...(args.items ?? []).map((i) => `  - ${i.quantity} x ${i.name}`), ...(args.shipping ? ["  - Shipping"] : [])];
  const text = (args.full !== false
    ? [`We've refunded order ${args.orderCode}: ${amount} back to the card you paid with. It can take 5 to 10 business days to show on your statement.`, ""]
    : [
        what.length ? `We've refunded ${amount} on order ${args.orderCode}, back to the card you paid with, for:` : `We've refunded ${amount} on order ${args.orderCode}, back to the card you paid with.`,
        ...what,
        ...(args.reason ? [`Reason: ${args.reason}`] : []),
        "It can take 5 to 10 business days to show on your statement.",
        "",
      ]
  ).concat([...viewLine(args.viewUrl), footer()]).join("\n");
  const subject = args.full !== false ? `Order ${args.orderCode} refunded` : `Refund on order ${args.orderCode}`;
  return sendTransactionalEmail({ to: args.to, toName: args.name ?? undefined, subject, text, fromName: FROM_NAME, replyTo: SHOP.contact.support_email });
}

/** The one-time code for looking up an order by email (NEW copy). */
export async function sendShopLookupCode(args: { to: string; orderCode: string; code: string }) {
  const text = [
    `Your code to see order ${args.orderCode}: ${args.code}`,
    "",
    "It works for 10 minutes. If you didn't ask for it, you can ignore this email.",
    "",
    footer(),
  ].join("\n");
  return sendTransactionalEmail({ to: args.to, subject: `Your code for order ${args.orderCode}`, text, fromName: FROM_NAME, replyTo: SHOP.contact.support_email });
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
