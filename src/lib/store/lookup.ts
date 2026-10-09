import "server-only";

/**
 * Customers finding their orders (service role).
 *
 *   startLookup   order number + the email or phone on the order -> a 6-digit
 *                 code (email: MailerSend, hashed here; phone: Twilio Verify in
 *                 production). The answer looks the same whether or not an
 *                 order matched, so the form can't be used to probe orders.
 *   finishLookup  the code -> the order's id (the route sets the signed cookie)
 *   canViewOrder  cookie, account (placed it, or confirmed email matches) or staff
 *   customerOrderView / accountOrders  what a buyer sees
 *
 * Outside production, text codes are simulated (logged, like texts and
 * emails), so dev can run the flow without Twilio.
 */

import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { isProduction } from "@/lib/env";
import { getTwilio, toE164, verifyConfigured, SMS_ENV } from "@/lib/sms/client";
import { sendShopLookupCode, uspsTrackingUrl } from "@/lib/email/shop";
import { hashLookupCode, maskEmail, maskPhone, newLookupCode, sameHash } from "./access";
import { orderCode, shipByDay } from "./rules";
import { formatPrice, shopDate } from "./copy";
import { digitalListsFor, isFinalSale, type ShipMethod } from "./config";

const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;

type OrderRow = {
  id: string; order_number: number; status: "paid" | "shipped" | "refunded" | "canceled"; email: string | null; phone: string | null; user_id: string | null;
  ship_name: string | null; ship_line1: string | null; ship_line2: string | null; ship_city: string | null; ship_state: string | null; ship_postal: string | null;
  ship_method: ShipMethod; amount_subtotal: number; amount_tax: number; amount_total: number; tracking_number: string | null; carrier: string | null;
  shipped_at: string | null; refund_reason: string | null; refunded_at: string | null; after_cutoff: boolean; created_at: string; amount_refunded: number;
};
const ORDER_COLS = "id, order_number, status, email, phone, user_id, ship_name, ship_line1, ship_line2, ship_city, ship_state, ship_postal, ship_method, amount_subtotal, amount_tax, amount_total, tracking_number, carrier, shipped_at, refund_reason, refunded_at, after_cutoff, created_at, amount_refunded";

export async function orderByNumber(n: number): Promise<OrderRow | null> {
  const { data } = await createServiceClient().from("shop_orders").select(ORDER_COLS).eq("order_number", n).abortSignal(new AbortController().signal).maybeSingle();
  return (data as OrderRow | null) ?? null;
}

export async function orderById(id: string): Promise<OrderRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createServiceClient().from("shop_orders").select(ORDER_COLS).eq("id", id).abortSignal(new AbortController().signal).maybeSingle();
  return (data as OrderRow | null) ?? null;
}

export function canViewOrder(order: Pick<OrderRow, "id" | "user_id" | "email">, who: { userId?: string | null; email?: string | null; emailConfirmed?: boolean; cookieIds?: string[]; staff?: boolean }): boolean {
  if (who.staff) return true;
  if (who.cookieIds?.includes(order.id)) return true;
  if (who.userId && order.user_id === who.userId) return true;
  if (who.emailConfirmed && who.email && order.email && who.email.toLowerCase() === order.email.toLowerCase()) return true;
  return false;
}

// ─── code lookup ────────────────────────────────────────────────────────────

export type StartResult = { ok: true; lookupId: string; channel: "email" | "sms"; sentTo: string } | { ok: false; error: "bad_order" | "bad_contact" | "sms_unavailable" };

export async function startLookup(args: { orderInput: number | null; contact: string; ipHash: string }): Promise<StartResult> {
  if (!args.orderInput) return { ok: false, error: "bad_order" };
  const raw = args.contact.trim();
  const isEmail = raw.includes("@");
  const email = isEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw.toLowerCase() : null;
  const phone = isEmail ? null : toE164(raw);
  if (!email && !phone) return { ok: false, error: "bad_contact" };
  const channel: "email" | "sms" = email ? "email" : "sms";
  const sentTo = email ? maskEmail(email) : maskPhone(phone!);

  const order = await orderByNumber(args.orderInput);
  const matches = !!order && (email ? order.email?.toLowerCase() === email : order.phone === phone);
  // Same answer whether or not it matched: a lookup id that leads nowhere.
  if (!order || !matches) return { ok: true, lookupId: randomUUID(), channel, sentTo };

  const svc = createServiceClient();
  const lookupId = randomUUID();
  const expiresAt = new Date(Date.now() + CODE_MINUTES * 60_000).toISOString();
  const useVerify = channel === "sms" && isProduction;
  if (useVerify && !verifyConfigured()) return { ok: false, error: "sms_unavailable" };
  const { code, hash } = newLookupCode(lookupId);
  const { error } = await svc.from("shop_lookup_codes").insert({ id: lookupId, order_id: order.id, channel, code_hash: useVerify ? null : hash, expires_at: expiresAt, ip_hash: args.ipHash });
  if (error) throw new Error(`shop lookup insert: ${error.message}`);

  const code_ = orderCode(order.order_number);
  if (channel === "email") {
    await sendShopLookupCode({ to: order.email!, orderCode: code_, code });
  } else if (useVerify) {
    await getTwilio().verify.v2.services(SMS_ENV.verifyServiceSid()!).verifications.create({ to: order.phone!, channel: "sms" });
  } else {
    console.log(`[shop lookup:non-prod] would text ${maskPhone(order.phone!)} the code ${code} for ${code_}`);
  }
  return { ok: true, lookupId, channel, sentTo };
}

export type FinishResult = { ok: true; orderId: string; orderCode: string } | { ok: false; error: "wrong_code" | "expired" | "too_many"; attemptsLeft?: number };

export async function finishLookup(args: { lookupId: string; code: string }): Promise<FinishResult> {
  const code = args.code.replace(/\D/g, "");
  if (!/^[0-9a-f-]{36}$/i.test(args.lookupId) || code.length !== 6) return { ok: false, error: "wrong_code" };
  const svc = createServiceClient();
  const { data: row } = await svc.from("shop_lookup_codes").select("id, order_id, channel, code_hash, attempts, expires_at, used_at").eq("id", args.lookupId).maybeSingle();
  if (!row) return { ok: false, error: "wrong_code", attemptsLeft: MAX_ATTEMPTS - 1 };
  if (row.used_at || Date.parse(row.expires_at as string) < Date.now()) return { ok: false, error: "expired" };
  if ((row.attempts as number) >= MAX_ATTEMPTS) return { ok: false, error: "too_many" };

  let good = false;
  if (row.code_hash) {
    good = sameHash(row.code_hash as string, hashLookupCode(row.id as string, code));
  } else {
    const order = await orderById(row.order_id as string);
    if (order?.phone) {
      const check = await getTwilio().verify.v2.services(SMS_ENV.verifyServiceSid()!).verificationChecks.create({ to: order.phone, code }).catch(() => null);
      good = check?.status === "approved";
    }
  }
  if (!good) {
    const attempts = (row.attempts as number) + 1;
    await svc.from("shop_lookup_codes").update({ attempts }).eq("id", row.id);
    return attempts >= MAX_ATTEMPTS ? { ok: false, error: "too_many" } : { ok: false, error: "wrong_code", attemptsLeft: MAX_ATTEMPTS - attempts };
  }
  await svc.from("shop_lookup_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);
  const order = await orderById(row.order_id as string);
  return { ok: true, orderId: row.order_id as string, orderCode: order ? orderCode(order.order_number) : "" };
}

// ─── what the buyer sees ────────────────────────────────────────────────────

export interface CustomerOrderView {
  id: string; code: string; status: OrderRow["status"]; placedLabel: string; shipByLabel: string; afterCutoff: boolean;
  items: { sku: string; name: string; quantity: number; unitAmount: number; finalSale: boolean }[];
  amountSubtotal: number; amountShipping: number; amountTax: number; amountTotal: number; amountRefunded: number;
  shipTo: { name: string | null; line1: string | null; line2: string | null; city: string | null; state: string | null; postal: string | null };
  tracking: string | null; trackingUrl: string | null; carrier: string | null; shippedLabel: string | null;
  refundReason: string | null;
  digitalLists: { id: string; title: string; url: string }[];
  timeline: { kind: string; label: string; at: string; atLabel: string; detail: Record<string, unknown> }[];
}

const dayLabel = (iso: string) => shopDate(iso, { weekday: true });

export async function customerOrderView(orderId: string): Promise<CustomerOrderView | null> {
  const order = await orderById(orderId);
  if (!order) return null;
  const svc = createServiceClient();
  const fresh = () => new AbortController().signal;
  const [{ data: items }, { data: events }] = await Promise.all([
    svc.from("shop_order_items").select("sku, quantity, unit_amount").eq("order_id", order.id).abortSignal(fresh()),
    svc.from("shop_order_events").select("kind, detail, created_at, visible").eq("order_id", order.id).eq("visible", true).order("created_at").abortSignal(fresh()),
  ]);
  const { data: products } = await svc.from("shop_products").select("sku, name, category").in("sku", (items ?? []).map((i) => i.sku)).abortSignal(fresh());
  const names = new Map((products ?? []).map((p) => [p.sku as string, p.name as string]));
  const categories = new Map((products ?? []).map((p) => [p.sku as string, p.category as string]));
  const LABEL: Record<string, string> = { placed: "Order placed", shipped: "Shipped", refunded: "Refunded", canceled: "Canceled", reshipped: "Sent again" };
  const timeline = ((events ?? []) as { kind: string; detail: Record<string, unknown>; created_at: string }[]).map((e) => ({
    kind: e.kind, label: e.kind === "refunded" && typeof e.detail?.amount === "number" && e.detail.full === false ? `Refunded ${formatPrice(e.detail.amount as number)}` : LABEL[e.kind] ?? e.kind, at: e.created_at, atLabel: dayLabel(e.created_at), detail: e.detail ?? {},
  }));
  if (!timeline.some((t) => t.kind === "placed")) timeline.unshift({ kind: "placed", label: LABEL.placed, at: order.created_at, atLabel: dayLabel(order.created_at), detail: {} });
  const shipBy = shipByDay(new Date(order.created_at));
  return {
    id: order.id, code: orderCode(order.order_number), status: order.status, placedLabel: dayLabel(order.created_at),
    shipByLabel: shopDate(`${shipBy}T12:00:00-08:00`, { weekday: true }), afterCutoff: order.after_cutoff,
    items: (items ?? []).map((i) => ({
      sku: i.sku as string, name: names.get(i.sku as string) ?? (i.sku as string), quantity: i.quantity as number, unitAmount: i.unit_amount as number,
      finalSale: isFinalSale(categories.get(i.sku as string) ?? ""),
    })),
    amountSubtotal: order.amount_subtotal, amountTax: order.amount_tax, amountTotal: order.amount_total, amountRefunded: order.amount_refunded ?? 0,
    amountShipping: Math.max(0, order.amount_total - order.amount_subtotal - order.amount_tax),
    shipTo: { name: order.ship_name, line1: order.ship_line1, line2: order.ship_line2, city: order.ship_city, state: order.ship_state, postal: order.ship_postal },
    tracking: order.tracking_number, trackingUrl: order.tracking_number ? uspsTrackingUrl(order.tracking_number) : null, carrier: order.carrier,
    shippedLabel: order.shipped_at ? dayLabel(order.shipped_at) : null, refundReason: order.refund_reason, timeline,
    digitalLists: digitalListsFor((items ?? []).map((i) => i.sku as string)),
  };
}

export interface AccountOrderSummary { id: string; code: string; status: OrderRow["status"]; placedLabel: string; total: number; itemCount: number }

/** Orders this account placed, or that used its confirmed email. */
export async function accountOrders(userId: string, confirmedEmail: string | null): Promise<AccountOrderSummary[]> {
  const svc = createServiceClient();
  const filters = [`user_id.eq.${userId}`];
  // Exact match on the lowercased email (orders store it lowercased); ilike would treat "_" as a wildcard.
  if (confirmedEmail && /^[^\s@,()"]+@[^\s@,()"]+$/.test(confirmedEmail)) filters.push(`email.eq.${confirmedEmail.toLowerCase()}`);
  const { data } = await svc.from("shop_orders").select("id, order_number, status, amount_total, created_at, shop_order_items(quantity)").or(filters.join(",")).order("created_at", { ascending: false }).limit(50);
  return ((data ?? []) as (Pick<OrderRow, "id" | "order_number" | "status" | "amount_total" | "created_at"> & { shop_order_items: { quantity: number }[] })[]).map((o) => ({
    id: o.id, code: orderCode(o.order_number), status: o.status, placedLabel: dayLabel(o.created_at), total: o.amount_total,
    itemCount: (o.shop_order_items ?? []).reduce((n, i) => n + i.quantity, 0),
  }));
}
