import "server-only";

/**
 * Staff order handling for Platform ▸ Shop orders (service role). Every action
 * leaves an entry on the order's timeline (shop_order_events; `visible` ones
 * show on the buyer's order page).
 *
 *   listOrders      to ship / shipped / refunded+canceled / all, with search
 *   orderDetail     everything about one order, incl. the full address
 *   markShipped     tracking number -> shipped, buyer emailed once
 *   refundOrder     full refund through Stripe (+ optional restock)
 *   restockOrder    packs back on the shelf, once (shop_restock)
 *   addNote         a staff-only note on the timeline
 *   resendConfirmation  the order email again
 */

import { getStripe } from "@/lib/stripe/client";
import { createServiceClient } from "@/lib/supabase/admin";
import { getBaseUrl } from "@/lib/env";
import { sendShopOrderReceived, sendShopShipped, uspsTrackingUrl } from "@/lib/email/shop";
import { orderLinkToken } from "./access";
import { REFUNDED_COLUMNS, notifyRefunded, type RefundedRow } from "./orders";
import { orderCode, refundCents, shipByDay, type RefundQuote } from "./rules";
import { shopDate } from "./copy";
import { SHOP_METADATA_KIND, digitalListsFor, type ShipMethod } from "./config";

export class ManageError extends Error {
  constructor(public code: string) { super(code); this.name = "ManageError"; }
}

export type OrderFilter = "to_ship" | "shipped" | "closed" | "all";

export interface AdminOrderRow {
  id: string; code: string; orderNumber: number; status: "paid" | "shipped" | "refunded" | "canceled"; createdAt: string;
  name: string | null; email: string | null; state: string | null; itemCount: number; total: number; shipMethod: ShipMethod;
  tracking: string | null; shortfall: boolean; restocked: boolean; refundReason: string | null; amountRefunded: number;
}

export async function listOrders(filter: OrderFilter, q: string): Promise<AdminOrderRow[]> {
  let query = createServiceClient().from("shop_orders")
    .select("id, order_number, status, created_at, ship_name, email, ship_state, amount_total, amount_refunded, ship_method, tracking_number, stock_shortfall, restocked_at, refund_reason, shop_order_items(quantity)")
    .order("created_at", { ascending: filter === "to_ship" })
    .limit(200);
  const term = q.trim();
  // A search looks at every order: someone typing an order number wants that order, whatever its status.
  if (!term) {
    if (filter === "to_ship") query = query.eq("status", "paid");
    else if (filter === "shipped") query = query.eq("status", "shipped");
    else if (filter === "closed") query = query.in("status", ["refunded", "canceled"]);
  }
  if (term) {
    const n = term.match(/(\d{3,9})/)?.[1];
    const safe = term.replace(/[,()"%_\\]/g, " ").trim().toLowerCase();
    const ors = [`email.eq.${safe}`, `ship_name.ilike.%${safe}%`];
    if (n) ors.push(`order_number.eq.${n}`);
    query = query.or(ors.join(","));
  }
  const { data, error } = await query;
  if (error) throw new Error(`shop orders: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((o) => ({
    id: o.id as string, code: orderCode(o.order_number as number), orderNumber: o.order_number as number, status: o.status as AdminOrderRow["status"],
    createdAt: o.created_at as string, name: (o.ship_name as string) ?? null, email: (o.email as string) ?? null, state: (o.ship_state as string) ?? null,
    itemCount: ((o.shop_order_items as { quantity: number }[]) ?? []).reduce((n, i) => n + i.quantity, 0), total: o.amount_total as number,
    shipMethod: o.ship_method as ShipMethod, tracking: (o.tracking_number as string) ?? null, shortfall: !!o.stock_shortfall,
    restocked: !!o.restocked_at, refundReason: (o.refund_reason as string) ?? null, amountRefunded: (o.amount_refunded as number) ?? 0,
  }));
}

export interface AdminOrderDetail extends AdminOrderRow {
  phone: string | null; address: { line1: string | null; line2: string | null; city: string | null; postal: string | null };
  items: { sku: string; name: string; quantity: number; unitAmount: number; refundedQuantity: number; restockedQuantity: number }[];
  shippingRefunded: boolean;
  amountSubtotal: number; amountShipping: number; amountTax: number; shipWeightOz: number; shipByLabel: string;
  trackingUrl: string | null; paymentIntentId: string | null; livemode: boolean; utm: Record<string, string | null>;
  stockShortfall: { sku: string; missing: number }[] | null;
  timeline: { kind: string; visible: boolean; detail: Record<string, unknown>; at: string; actor: string | null }[];
}

export async function orderDetail(id: string): Promise<AdminOrderDetail | null> {
  const svc = createServiceClient();
  const { data: o } = await svc.from("shop_orders").select("*").eq("id", id).maybeSingle();
  if (!o) return null;
  const [{ data: items }, { data: events }] = await Promise.all([
    svc.from("shop_order_items").select("sku, quantity, unit_amount, refunded_quantity, restocked_quantity").eq("order_id", id),
    svc.from("shop_order_events").select("kind, visible, detail, created_at, actor_user_id").eq("order_id", id).order("created_at"),
  ]);
  const skus = (items ?? []).map((i) => i.sku as string);
  const actors = [...new Set(((events ?? []) as { actor_user_id: string | null }[]).map((e) => e.actor_user_id).filter((x): x is string => !!x))];
  const [{ data: products }, { data: people }] = await Promise.all([
    svc.from("shop_products").select("sku, name").in("sku", skus.length ? skus : ["-"]),
    svc.from("users").select("id, display_name, username").in("id", actors.length ? actors : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const names = new Map((products ?? []).map((p) => [p.sku as string, p.name as string]));
  const who = new Map((people ?? []).map((p) => [p.id as string, (p.display_name as string) || (p.username as string) || "Staff"]));
  const shipBy = shipByDay(new Date(o.created_at as string));
  return {
    id: o.id, code: orderCode(o.order_number), orderNumber: o.order_number, status: o.status, createdAt: o.created_at,
    name: o.ship_name, email: o.email, state: o.ship_state, itemCount: (items ?? []).reduce((n, i) => n + (i.quantity as number), 0), total: o.amount_total,
    shipMethod: o.ship_method, tracking: o.tracking_number, shortfall: !!o.stock_shortfall, restocked: !!o.restocked_at, refundReason: o.refund_reason, amountRefunded: o.amount_refunded ?? 0, shippingRefunded: !!o.shipping_refunded,
    phone: o.phone ?? null, address: { line1: o.ship_line1, line2: o.ship_line2, city: o.ship_city, postal: o.ship_postal },
    items: (items ?? []).map((i) => ({
      sku: i.sku as string, name: names.get(i.sku as string) ?? (i.sku as string), quantity: i.quantity as number, unitAmount: i.unit_amount as number,
      refundedQuantity: (i.refunded_quantity as number) ?? 0, restockedQuantity: (i.restocked_quantity as number) ?? 0,
    })),
    amountSubtotal: o.amount_subtotal, amountTax: o.amount_tax, amountShipping: Math.max(0, o.amount_total - o.amount_subtotal - o.amount_tax),
    shipWeightOz: Number(o.ship_weight_oz), shipByLabel: shopDate(`${shipBy}T12:00:00-08:00`, { weekday: true }),
    trackingUrl: o.tracking_number ? uspsTrackingUrl(o.tracking_number) : null, paymentIntentId: o.payment_intent_id, livemode: !!o.livemode,
    utm: { source: o.utm_source, medium: o.utm_medium, campaign: o.utm_campaign, content: o.utm_content, page: o.source_page },
    stockShortfall: o.stock_shortfall ?? null,
    timeline: ((events ?? []) as { kind: string; visible: boolean; detail: Record<string, unknown>; created_at: string; actor_user_id: string | null }[])
      .map((e) => ({ kind: e.kind, visible: e.visible, detail: e.detail ?? {}, at: e.created_at, actor: e.actor_user_id ? who.get(e.actor_user_id) ?? "Staff" : null })),
  };
}

async function event(orderId: string, kind: string, visible: boolean, detail: Record<string, unknown>, actor: string | null) {
  await createServiceClient().from("shop_order_events").insert({ order_id: orderId, kind, visible, detail, actor_user_id: actor });
}

const viewUrl = (orderId: string) => `${getBaseUrl()}/shop/orders/view?t=${encodeURIComponent(orderLinkToken(orderId))}`;

/** Paid -> shipped with a tracking number; the buyer is emailed once. */
export async function markShipped(id: string, trackingRaw: string, actor: string | null): Promise<void> {
  const tracking = trackingRaw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z0-9]{10,34}$/.test(tracking)) throw new ManageError("bad_tracking");
  const svc = createServiceClient();
  const now = new Date().toISOString();
  const { data: rows } = await svc.from("shop_orders").update({ status: "shipped", tracking_number: tracking, shipped_at: now, updated_at: now })
    .eq("id", id).eq("status", "paid").select("id, order_number, email, ship_name");
  const o = rows?.[0];
  if (!o) throw new ManageError("not_shippable");
  await event(id, "shipped", true, { tracking, carrier: "USPS" }, actor);
  const { data: claimed } = await svc.from("shop_orders").update({ shipped_email_sent_at: now }).eq("id", id).is("shipped_email_sent_at", null).select("id");
  if (claimed?.length && o.email) {
    await sendShopShipped({ to: o.email as string, orderCode: orderCode(o.order_number as number), tracking, name: (o.ship_name as string) ?? null, viewUrl: viewUrl(id) })
      .catch((e) => console.error("[shop] shipped email failed:", e));
  }
}

/** Fix a tracking number on a shipped order (no new email). */
export async function updateTracking(id: string, trackingRaw: string, actor: string | null): Promise<void> {
  const tracking = trackingRaw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z0-9]{10,34}$/.test(tracking)) throw new ManageError("bad_tracking");
  const { data } = await createServiceClient().from("shop_orders").update({ tracking_number: tracking, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "shipped").select("id");
  if (!data?.length) throw new ManageError("not_shipped");
  await event(id, "updated", false, { tracking }, actor);
}

// ─── refunds (full and partial) ─────────────────────────────────────────────

export type RefundReason = "damaged" | "missing" | "goodwill" | "other";
/** What the buyer's email says about why; goodwill and other say nothing. */
const REASON_LABEL: Record<RefundReason, string | null> = { damaged: "Damaged in transit", missing: "Missing from the order", goodwill: null, other: null };

export interface AdminRefundQuote extends RefundQuote { status: string; code: string }

/** What this order can still refund, line by line, from Stripe's own totals (so each item's tax goes back with it). */
export async function refundQuote(id: string): Promise<AdminRefundQuote> {
  const svc = createServiceClient();
  const { data: o } = await svc.from("shop_orders").select("order_number, status, checkout_session_id, amount_total, amount_refunded, shipping_refunded").eq("id", id).maybeSingle();
  if (!o) throw new ManageError("not_found");
  if (!o.checkout_session_id) throw new ManageError("no_payment");
  const [{ data: items }, lineItems, session] = await Promise.all([
    svc.from("shop_order_items").select("sku, quantity, refunded_quantity, unit_amount").eq("order_id", id),
    getStripe().checkout.sessions.listLineItems(o.checkout_session_id as string, { limit: 100, expand: ["data.price"] }),
    getStripe().checkout.sessions.retrieve(o.checkout_session_id as string),
  ]);
  const skus = (items ?? []).map((i) => i.sku as string);
  const { data: products } = await svc.from("shop_products").select("sku, name, stripe_price_id").in("sku", skus.length ? skus : ["-"]);
  const byPrice = new Map((products ?? []).map((p) => [p.stripe_price_id as string, p.sku as string]));
  const names = new Map((products ?? []).map((p) => [p.sku as string, p.name as string]));
  const totals = new Map<string, number>();
  for (const li of lineItems.data) {
    const sku = (li.price?.metadata?.sku as string | undefined) ?? (li.price ? byPrice.get(li.price.id) : undefined);
    if (sku) totals.set(sku, (totals.get(sku) ?? 0) + li.amount_total);
  }
  const shippingTotal = session.shipping_cost?.amount_total ?? 0;
  return {
    status: o.status as string, code: orderCode(o.order_number as number),
    amountTotal: o.amount_total as number, amountRefunded: o.amount_refunded as number,
    lines: (items ?? []).map((i) => ({
      sku: i.sku as string, name: names.get(i.sku as string) ?? (i.sku as string), quantity: i.quantity as number, refundedQuantity: i.refunded_quantity as number,
      lineTotal: totals.get(i.sku as string) ?? (i.unit_amount as number) * (i.quantity as number),
    })),
    shipping: { total: shippingTotal, refunded: !!o.shipping_refunded || shippingTotal === 0 },
  };
}

export interface RefundRequest {
  /** Units of each item to refund (their tax comes back with them). */
  items?: { sku: string; quantity: number }[];
  /** Refund the shipping charge too. */
  shipping?: boolean;
  /** A set amount instead of items (goodwill), in cents; capped at what's left. */
  amountCents?: number | null;
  reason: RefundReason;
  /** Staff-only note for the timeline. */
  note?: string | null;
  /** Put the refunded items back on the shelf (off for damaged ones). */
  restock?: boolean;
}

/**
 * Refund part (or all) of an order. The refund is claimed in the database first
 * (row lock: two clicks can't refund twice or past the total), then Stripe is
 * asked for exactly that amount; if Stripe refuses, the claim is undone. The
 * charge.refunded webhook then finds the totals already match.
 */
export async function refundOrderPart(id: string, req: RefundRequest, actor: string | null): Promise<{ amount: number; full: boolean }> {
  const svc = createServiceClient();
  const { data: o } = await svc.from("shop_orders").select(`${REFUNDED_COLUMNS}, status, payment_intent_id`).eq("id", id).maybeSingle();
  if (!o) throw new ManageError("not_found");
  if (o.status !== "paid" && o.status !== "shipped") throw new ManageError("not_refundable");
  if (!o.payment_intent_id) throw new ManageError("no_payment");
  if (!(["damaged", "missing", "goodwill", "other"] as string[]).includes(req.reason)) throw new ManageError("bad_reason");
  const quote = await refundQuote(id);
  const left = quote.amountTotal - quote.amountRefunded;
  const items = (req.items ?? []).filter((i) => Number.isInteger(i.quantity) && i.quantity > 0).map((i) => ({ sku: String(i.sku), quantity: i.quantity }));
  const amount = req.amountCents != null ? Math.round(Number(req.amountCents)) : refundCents(quote, items, !!req.shipping);
  if (!Number.isFinite(amount) || amount < 1) throw new ManageError("nothing_to_refund");
  if (amount > left) throw new ManageError("too_much");

  const { data: claim, error } = await svc.rpc("shop_claim_refund", { p_order_id: id, p_amount: amount, p_items: items, p_shipping: !!req.shipping });
  if (error) throw new ManageError(/left to refund/.test(error.message) ? "too_many_items" : "refund_failed");
  const c = claim as { ok: boolean; reason?: string; amount_refunded?: number; full?: boolean };
  if (!c.ok) throw new ManageError(c.reason ?? "refund_failed");

  try {
    await getStripe().refunds.create(
      { payment_intent: o.payment_intent_id as string, amount, metadata: { gs_kind: SHOP_METADATA_KIND, order_id: id, reason: req.reason } },
      { idempotencyKey: `gs-shop-refund-${id}-${c.amount_refunded}` },
    );
  } catch (err) {
    console.error("[shop] refund failed at Stripe:", err instanceof Error ? err.message : err);
    await svc.rpc("shop_release_refund", { p_order_id: id, p_amount: amount, p_items: items, p_shipping: !!req.shipping, p_prev_status: o.status });
    throw new ManageError("stripe_failed");
  }

  if (req.note?.trim()) await addNote(id, req.note, actor);
  if (req.restock && items.length) await restockItems(id, items, actor).catch(() => {});
  const names = new Map(quote.lines.map((l) => [l.sku, l.name]));
  await notifyRefunded(o as unknown as RefundedRow, {
    amount, full: !!c.full, source: "staff", shipping: !!req.shipping, reason: req.reason, reasonLabel: REASON_LABEL[req.reason],
    items: items.map((i) => ({ sku: i.sku, name: names.get(i.sku) ?? i.sku, quantity: i.quantity })),
  }, actor);
  return { amount, full: !!c.full };
}

/** Refund everything that's left (items, shipping and any remainder), optionally putting it all back in stock. */
export async function refundOrder(id: string, opts: { restock: boolean; reason?: RefundReason }, actor: string | null): Promise<void> {
  const quote = await refundQuote(id);
  const items = quote.lines.map((l) => ({ sku: l.sku, quantity: l.quantity - l.refundedQuantity })).filter((i) => i.quantity > 0);
  await refundOrderPart(id, { items, shipping: !quote.shipping.refunded, amountCents: quote.amountTotal - quote.amountRefunded, reason: opts.reason ?? "other" }, actor);
  if (opts.restock) await restockOrder(id, actor).catch((e) => { if (!(e instanceof ManageError)) throw e; });
}

/** Put specific refunded units back on the shelf. */
export async function restockItems(id: string, items: { sku: string; quantity: number }[], actor: string | null): Promise<{ units: number }> {
  const { data, error } = await createServiceClient().rpc("shop_restock_items", { p_order_id: id, p_items: items, p_actor: actor });
  if (error) throw new Error(`shop_restock_items: ${error.message}`);
  const r = data as { ok: boolean; reason?: string; units?: number };
  if (!r.ok) throw new ManageError(r.reason ?? "restock_failed");
  return { units: r.units ?? 0 };
}

export async function restockOrder(id: string, actor: string | null): Promise<{ units: number }> {
  const { data, error } = await createServiceClient().rpc("shop_restock", { p_order_id: id, p_actor: actor });
  if (error) throw new Error(`shop_restock: ${error.message}`);
  const r = data as { ok: boolean; reason?: string; units?: number };
  if (!r.ok) throw new ManageError(r.reason ?? "restock_failed");
  return { units: r.units ?? 0 };
}

export async function addNote(id: string, text: string, actor: string | null): Promise<void> {
  const note = text.trim().slice(0, 1000);
  if (!note) throw new ManageError("empty_note");
  await event(id, "note", false, { text: note }, actor);
}

export async function resendConfirmation(id: string, actor: string | null): Promise<void> {
  const d = await orderDetail(id);
  if (!d?.email) throw new ManageError("no_email");
  const svc = createServiceClient();
  const [{ data: products }, { data: owner }] = await Promise.all([
    svc.from("shop_products").select("sku, contents").in("sku", d.items.map((i) => i.sku)),
    svc.from("shop_orders").select("user_id, after_cutoff").eq("id", id).maybeSingle(),
  ]);
  const contents = new Map((products ?? []).map((p) => [p.sku as string, (p.contents as string[]) ?? []]));
  await sendShopOrderReceived({
    to: d.email, orderCode: d.code, shipBy: d.shipByLabel, afterCutoff: !!owner?.after_cutoff, name: d.name, city: d.address.city, state: d.state,
    items: d.items.map((i) => ({ name: i.name, quantity: i.quantity, contents: contents.get(i.sku) ?? [], unitAmount: i.unitAmount })), viewUrl: viewUrl(id),
    digitalLists: digitalListsFor(d.items.map((i) => i.sku)), account: { member: !!owner?.user_id },
  });
  await event(id, "email", false, { what: "confirmation_resent" }, actor);
}
