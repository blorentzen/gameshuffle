import "server-only";

/**
 * Shop orders from Stripe Checkout (service role). fulfilShopSession runs from
 * the webhook and from /shop/thanks, whichever gets there first; shop_fulfil
 * makes it one order per session however many times it's called. Addresses
 * we can't ship to (APO/FPO/DPO, outside the 50 states and DC) can't be
 * refused inside hosted Checkout, so they're recorded, refunded and emailed
 * here, without touching stock.
 */

import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { createServiceClient } from "@/lib/supabase/admin";
import { shippingOf } from "@/lib/stripe/payload";
import { SHOP, SHOP_METADATA_KIND, type ShipMethod } from "./config";
import { missesChristmas, orderCode, shipByDay, shipMethodFor, shipWeightOz, type CartLine } from "./rules";
import { shopDate } from "./copy";
import { sendShopCantShip, sendShopNewOrderAlert, sendShopOrderReceived, type ShopEmailItem } from "@/lib/email/shop";

const UUID = /^[0-9a-f-]{36}$/i;

export interface ShopOrderSummary {
  orderNumber: number;
  code: string;
  status: "paid" | "shipped" | "refunded" | "canceled";
  shipMethod: ShipMethod;
  shipBy: string;
  shipByLabel: string;
  afterCutoff: boolean;
  items: { sku: string; name: string; quantity: number; unitAmount: number }[];
  amountSubtotal: number;
  amountShipping: number;
  amountTax: number;
  amountTotal: number;
  shipName: string | null;
  shipCity: string | null;
  shipState: string | null;
  refundReason: string | null;
}

export type FulfilResult = { ok: true; created: boolean; order: ShopOrderSummary } | { ok: false; reason: "not_shop" | "not_paid" | "no_items" | "not_found" };

const METHOD_LABEL: Record<ShipMethod, string> = { parcel: "Ground Advantage", letter: "letter", flat: "large envelope" };

async function summaryFor(sessionId: string): Promise<ShopOrderSummary | null> {
  const svc = createServiceClient();
  // Each read gets its own AbortSignal: inside a page render Next memoizes
  // identical GETs, so the read after creating the order would otherwise get
  // the "no order yet" answer from the check before it.
  const fresh = () => new AbortController().signal;
  const { data: o } = await svc.from("shop_orders")
    .select("id, order_number, status, ship_method, amount_subtotal, amount_tax, amount_total, ship_name, ship_city, ship_state, after_cutoff, refund_reason, created_at")
    .eq("checkout_session_id", sessionId).abortSignal(fresh()).maybeSingle();
  if (!o) return null;
  const { data: items } = await svc.from("shop_order_items").select("sku, quantity, unit_amount").eq("order_id", o.id).abortSignal(fresh());
  const { data: products } = await svc.from("shop_products").select("sku, name").in("sku", (items ?? []).map((i) => i.sku)).abortSignal(fresh());
  const names = new Map((products ?? []).map((p) => [p.sku as string, p.name as string]));
  const shipBy = shipByDay(new Date(o.created_at as string));
  return {
    orderNumber: o.order_number as number,
    code: orderCode(o.order_number as number),
    status: o.status as ShopOrderSummary["status"],
    shipMethod: o.ship_method as ShipMethod,
    shipBy,
    shipByLabel: shopDate(`${shipBy}T12:00:00-08:00`, { weekday: true }),
    afterCutoff: !!o.after_cutoff,
    items: (items ?? []).map((i) => ({ sku: i.sku as string, name: names.get(i.sku as string) ?? (i.sku as string), quantity: i.quantity as number, unitAmount: i.unit_amount as number })),
    amountSubtotal: o.amount_subtotal as number,
    amountTax: o.amount_tax as number,
    amountTotal: o.amount_total as number,
    amountShipping: Math.max(0, (o.amount_total as number) - (o.amount_subtotal as number) - (o.amount_tax as number)),
    shipName: o.ship_name as string | null,
    shipCity: o.ship_city as string | null,
    shipState: o.ship_state as string | null,
    refundReason: o.refund_reason as string | null,
  };
}

/** Turn a paid Checkout Session into an order (once), then send the emails (once). */
export async function fulfilShopSession(sessionId: string): Promise<FulfilResult> {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return { ok: false, reason: "not_found" };
  const stripe = getStripe();
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    if ((err as { code?: string }).code === "resource_missing") return { ok: false, reason: "not_found" };
    throw err;
  }
  if (session.metadata?.gs_kind !== SHOP_METADATA_KIND) return { ok: false, reason: "not_shop" };
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") return { ok: false, reason: "not_paid" };

  const existing = await summaryFor(sessionId);
  if (existing) return { ok: true, created: false, order: existing };

  const svc = createServiceClient();
  const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100, expand: ["data.price"] });
  const { data: products } = await svc.from("shop_products").select("sku, name, contents, stripe_price_id");
  const byPrice = new Map((products ?? []).map((p) => [p.stripe_price_id as string, p]));
  const bySku = new Map((products ?? []).map((p) => [p.sku as string, p]));
  const items = lineItems.data
    .map((li) => {
      const price = li.price as Stripe.Price | null;
      const sku = (price?.metadata?.sku as string | undefined) ?? (price ? (byPrice.get(price.id)?.sku as string | undefined) : undefined);
      return sku && bySku.has(sku) ? { sku, quantity: li.quantity ?? 0, unit_amount: price?.unit_amount ?? Math.round((li.amount_subtotal ?? 0) / Math.max(1, li.quantity ?? 1)) } : null;
    })
    .filter((x): x is { sku: string; quantity: number; unit_amount: number } => !!x && x.quantity > 0);
  if (items.length === 0) return { ok: false, reason: "no_items" };

  const lines: CartLine[] = items.map((i) => ({ sku: i.sku, quantity: i.quantity }));
  const method = shipMethodFor(lines);
  const ship = shippingOf(session);
  const created = new Date(session.created * 1000);
  const userId = session.client_reference_id && UUID.test(session.client_reference_id) ? session.client_reference_id : null;
  const md = session.metadata ?? {};
  const order = {
    checkout_session_id: session.id,
    payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
    livemode: session.livemode,
    email: session.customer_details?.email ?? null,
    user_id: userId,
    ship_name: ship?.name ?? session.customer_details?.name ?? null,
    ship_line1: ship?.line1 ?? null, ship_line2: ship?.line2 ?? null, ship_city: ship?.city ?? null,
    ship_state: ship?.state && /^[A-Z]{2}$/.test(ship.state) ? ship.state : null,
    ship_postal: ship?.postal ?? null,
    ship_method: method,
    ship_weight_oz: shipWeightOz(lines, method),
    amount_subtotal: session.amount_subtotal ?? 0,
    amount_tax: session.total_details?.amount_tax ?? 0,
    amount_total: session.amount_total ?? 0,
    utm_source: md.utm_source ?? null, utm_medium: md.utm_medium ?? null, utm_campaign: md.utm_campaign ?? null, utm_content: md.utm_content ?? null,
    source_page: md.source_page ?? null,
    after_cutoff: missesChristmas(ship?.state, created),
  };

  const cantShip = !ship || ship.country !== "US" || (ship.state !== null && SHOP.checkout.blocked_states.includes(ship.state));
  if (cantShip) {
    await refuseAddress(session, order, items);
  } else {
    const { data: res, error } = await svc.rpc("shop_fulfil", { p_order: order, p_items: items });
    if (error) throw new Error(`shop_fulfil: ${error.message}`);
    const r = res as { ok: boolean; created: boolean; order_id: string; order_number: number; shortfall?: { sku: string; missing: number }[] | null };
    if (r.created) await sendOrderEmails(r.order_id, r.order_number, order, items, bySku, r.shortfall ?? null, created);
    if (r.created && order.payment_intent_id && order.email) {
      // A Stripe receipt for the payment (sent in live mode only); best effort.
      await stripe.paymentIntents.update(order.payment_intent_id, { receipt_email: order.email }).catch((e) => console.warn("[shop] receipt_email failed:", e instanceof Error ? e.message : e));
    }
  }
  const summary = await summaryFor(sessionId);
  return summary ? { ok: true, created: true, order: summary } : { ok: false, reason: "not_found" };
}

async function sendOrderEmails(orderId: string, orderNumber: number, order: { email: string | null; ship_name: string | null; ship_city: string | null; ship_state: string | null; amount_total: number; ship_method: ShipMethod; after_cutoff: boolean }, items: { sku: string; quantity: number; unit_amount: number }[], bySku: Map<string, Record<string, unknown>>, shortfall: { sku: string; missing: number }[] | null, orderedAt: Date) {
  const svc = createServiceClient();
  // Claim the send so a second delivery of the same event can't email twice.
  const { data: claimed } = await svc.from("shop_orders").update({ confirmation_sent_at: new Date().toISOString() }).eq("id", orderId).is("confirmation_sent_at", null).select("id");
  if (!claimed?.length) return;
  const emailItems: ShopEmailItem[] = items.map((i) => {
    const p = bySku.get(i.sku);
    return { name: (p?.name as string) ?? i.sku, quantity: i.quantity, contents: (p?.contents as string[]) ?? [], unitAmount: i.unit_amount };
  });
  const code = orderCode(orderNumber);
  const shipBy = shopDate(`${shipByDay(orderedAt)}T12:00:00-08:00`, { weekday: true });
  if (order.email) {
    await sendShopOrderReceived({ to: order.email, orderCode: code, items: emailItems, shipBy, afterCutoff: order.after_cutoff, name: order.ship_name, city: order.ship_city, state: order.ship_state })
      .catch((e) => console.error("[shop] order email failed:", e));
  }
  await sendShopNewOrderAlert({ orderCode: code, items: emailItems, totalCents: order.amount_total, shipMethodLabel: METHOD_LABEL[order.ship_method], name: order.ship_name, city: order.ship_city, state: order.ship_state, shortfall })
    .catch((e) => console.error("[shop] alert email failed:", e));
}

/** Record an order we can't ship, refund it in full and tell the buyer. Stock is untouched. */
async function refuseAddress(session: Stripe.Checkout.Session, order: Record<string, unknown>, items: { sku: string; quantity: number; unit_amount: number }[]) {
  const svc = createServiceClient();
  const { data: row, error } = await svc.from("shop_orders")
    .insert({ ...order, status: "canceled", refund_reason: "cant_ship_address", refunded_at: new Date().toISOString() })
    .select("id, order_number").single();
  if (error) {
    if (error.code === "23505") return; // already recorded by another delivery
    throw new Error(`shop refuse insert: ${error.message}`);
  }
  await svc.from("shop_order_items").insert(items.map((i) => ({ order_id: row.id, ...i })));
  await releaseShopHolds(session.id);
  const pi = order.payment_intent_id as string | null;
  if (pi) await getStripe().refunds.create({ payment_intent: pi, reason: "requested_by_customer", metadata: { gs_kind: SHOP_METADATA_KIND, reason: "cant_ship_address" } });
  const email = order.email as string | null;
  if (email) await sendShopCantShip({ to: email, orderCode: orderCode(row.order_number as number), name: order.ship_name as string | null }).catch((e) => console.error("[shop] cant-ship email failed:", e));
}

/** A Checkout Session expired or was abandoned: its holds stop counting now. */
export async function releaseShopHolds(sessionId: string): Promise<number> {
  const { data } = await createServiceClient().from("shop_stock_holds").update({ released_at: new Date().toISOString() })
    .eq("checkout_session_id", sessionId).is("released_at", null).select("id");
  return data?.length ?? 0;
}

/** Tidy holds past their expiry (they already don't count; this just closes the rows). */
export async function sweepShopHolds(): Promise<number> {
  const { data } = await createServiceClient().from("shop_stock_holds").update({ released_at: new Date().toISOString() })
    .lt("expires_at", new Date().toISOString()).is("released_at", null).select("id");
  return data?.length ?? 0;
}

/** charge.refunded: a full refund on a shop order marks it refunded (restocking is a manual call in admin). */
export async function markShopRefund(charge: Stripe.Charge): Promise<boolean> {
  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!pi || !charge.refunded) return false;
  const { data } = await createServiceClient().from("shop_orders")
    .update({ status: "refunded", refunded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("payment_intent_id", pi).in("status", ["paid", "shipped"]).select("id");
  return (data?.length ?? 0) > 0;
}
