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
import { nameWithPicks, picksFor } from "./orderPicks";
import { isProduction } from "@/lib/env";
import { getTwilio, toE164, verifyConfigured, SMS_ENV } from "@/lib/sms/client";
import { sendShopLookupCode, uspsTrackingUrl } from "@/lib/email/shop";
import { hashLookupCode, maskEmail, maskPhone, newLookupCode, sameHash } from "./access";
import { addBusinessDays, orderCode, shipByDay } from "./rules";
import { MERCH_CATEGORY } from "./merch";
import { SHOP } from "./config";
import { TRANSIT_DAYS } from "./orderEmail";
import { REPORT_DAYS, formatAddress, messagesFor, photoLinks, requestsFor, shipmentsFor } from "./tracking";
import { problemLabel, stageLabel, stageOf, stepsFor, type RequestKind, type RequestStatus, type ShipmentStatus, type Stage, type Step } from "./orderStage";
import { gsDay } from "@/lib/time/gsClock";
import { formatPrice, shopDate } from "./copy";
import { digitalListsFor, isFinalSale, type ShipMethod } from "./config";

const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;

type OrderRow = {
  id: string; order_number: number; status: "paid" | "shipped" | "refunded" | "canceled"; email: string | null; phone: string | null; user_id: string | null;
  ship_name: string | null; ship_line1: string | null; ship_line2: string | null; ship_city: string | null; ship_state: string | null; ship_postal: string | null;
  ship_method: ShipMethod; amount_subtotal: number; amount_tax: number; amount_total: number; tracking_number: string | null; carrier: string | null;
  shipped_at: string | null; refund_reason: string | null; refunded_at: string | null; after_cutoff: boolean; created_at: string; amount_refunded: number;
  tracking_url: string | null; delivered_at?: string | null;
};
const ORDER_COLS = "id, order_number, status, email, phone, user_id, ship_name, ship_line1, ship_line2, ship_city, ship_state, ship_postal, ship_method, amount_subtotal, amount_tax, amount_total, tracking_number, carrier, shipped_at, refund_reason, refunded_at, after_cutoff, created_at, amount_refunded, tracking_url";

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

export interface ViewItem { sku: string; name: string; detail: string | null; quantity: number; unitAmount: number; finalSale: boolean; image: string | null }
export interface ViewBox {
  id: string; label: string; carrier: string | null; tracking: string | null; trackingUrl: string | null; status: ShipmentStatus;
  statusLine: string; events: { text: string; at: string }[]; items: { name: string; image: string | null; quantity: number }[];
}
export interface ViewRequest {
  id: string; kind: RequestKind; line: string; itemName: string | null; sku: string | null; wants: string | null; status: RequestStatus; statusLabel: string; body: string | null;
  photos: string[]; address: string | null; at: string; messages: { from: "buyer" | "staff"; body: string; at: string; name: string | null }[];
}

export interface CustomerOrderView {
  id: string; code: string; status: OrderRow["status"]; placedLabel: string; shipByLabel: string; afterCutoff: boolean;
  items: ViewItem[];
  amountSubtotal: number; amountShipping: number; amountTax: number; amountTotal: number; amountRefunded: number;
  shipTo: { name: string | null; line1: string | null; line2: string | null; city: string | null; state: string | null; postal: string | null };
  tracking: string | null; trackingUrl: string | null; carrier: string | null; shippedLabel: string | null;
  refundReason: string | null;
  digitalLists: { id: string; title: string; url: string }[];
  timeline: { kind: string; label: string; at: string; atLabel: string; detail: Record<string, unknown> }[];
  /** Order tracking (picks 2026-11-08). */
  merch: boolean; stage: Stage; stageLabel: string; headline: string; lede: string; steps: Step[];
  boxes: ViewBox[]; waiting: { name: string; image: string | null; quantity: number }[];
  requests: ViewRequest[];
  can: { report: boolean; address: boolean; ask: boolean };
}

const dayLabel = (iso: string) => shopDate(iso, { weekday: true });
const ymdLabel = (ymd: string, weekday = false) => shopDate(`${ymd}T12:00:00-08:00`, { weekday });
/** "Nov 13 to 18", or "Nov 28 to Dec 3" across a month. */
function span(a: string, b: string): string {
  const x = ymdLabel(a), y = ymdLabel(b);
  if (x === y) return ymdLabel(a, true);
  return x.split(" ")[0] === y.split(" ")[0] ? `${x} to ${y.split(" ")[1]}` : `${x} to ${y}`;
}
const STATUS_LABEL: Record<RequestStatus, string> = { open: "We're on it", waiting: "Waiting for you", resolved: "Done" };
const RESOLVED_LABEL: Record<string, string> = { reprinted: "Done: a new one is on its way", refunded: "Done: refunded", address_changed: "Done: address changed", answered: "Answered", declined: "Closed" };

export async function customerOrderView(orderId: string): Promise<CustomerOrderView | null> {
  const order = await orderById(orderId);
  if (!order) return null;
  const svc = createServiceClient();
  const fresh = () => new AbortController().signal;
  const [{ data: items }, { data: events }, { data: extra }] = await Promise.all([
    svc.from("shop_order_items").select("sku, quantity, unit_amount").eq("order_id", order.id).abortSignal(fresh()),
    svc.from("shop_order_events").select("kind, detail, created_at, visible").eq("order_id", order.id).eq("visible", true).order("created_at").abortSignal(fresh()),
    svc.from("shop_orders").select("delivered_at").eq("id", order.id).abortSignal(fresh()).maybeSingle(),
  ]);
  const deliveredAt = (extra as { delivered_at?: string | null } | null)?.delivered_at ?? null;
  const { data: products } = await svc.from("shop_products").select("sku, name, category, image_url").in("sku", (items ?? []).map((i) => i.sku)).abortSignal(fresh());
  const [picks, boxesRaw, requestsRaw, messages] = await Promise.all([picksFor(order.id), shipmentsFor(order.id), requestsFor(order.id), messagesFor(order.id)]);
  const bySku = new Map((products ?? []).map((p) => [p.sku as string, p as { sku: string; name: string; category: string; image_url: string | null }]));
  const merch = (items ?? []).some((i) => bySku.get(i.sku as string)?.category === MERCH_CATEGORY);
  const viewItems: ViewItem[] = (items ?? []).map((i) => {
    const p = bySku.get(i.sku as string);
    const [name, ...rest] = nameWithPicks(p?.name ?? (i.sku as string), i.sku as string, picks).split(" · ");
    return {
      sku: i.sku as string, name, detail: rest.length ? rest.join(" · ") : null, quantity: i.quantity as number, unitAmount: i.unit_amount as number,
      finalSale: isFinalSale(p?.category ?? ""), image: p?.category === MERCH_CATEGORY ? p.image_url : null,
    };
  });
  const itemBySku = new Map(viewItems.map((i) => [i.sku, i]));

  const LABEL: Record<string, string> = { placed: "Order placed", shipped: "Shipped", refunded: "Refunded", canceled: "Canceled", reshipped: "Sent again", delivered: "Delivered", late: "Running late", returned: "A box came back", request: "You asked for help" };
  const timeline = ((events ?? []) as { kind: string; detail: Record<string, unknown>; created_at: string }[]).filter((e) => e.kind !== "message").map((e) => ({
    kind: e.kind, label: e.kind === "refunded" && typeof e.detail?.amount === "number" && e.detail.full === false ? `Refunded ${formatPrice(e.detail.amount as number)}` : e.kind === "request" && typeof e.detail?.line === "string" ? (e.detail.line as string) : LABEL[e.kind] ?? e.kind, at: e.created_at, atLabel: dayLabel(e.created_at), detail: e.detail ?? {},
  }));
  if (!timeline.some((t) => t.kind === "placed")) timeline.unshift({ kind: "placed", label: LABEL.placed, at: order.created_at, atLabel: dayLabel(order.created_at), detail: {} });

  const units = viewItems.reduce((n, i) => n + i.quantity, 0);
  const live = boxesRaw.filter((b) => b.status !== "canceled");
  const stage = stageOf({ status: order.status, units }, live);
  const shipBy = shipByDay(new Date(order.created_at));
  const shipByLabel = shopDate(`${shipBy}T12:00:00-08:00`, { weekday: true });
  const today = gsDay();
  const est = SHOP.checkout.shipping_estimate_business_days;
  const moving = live.filter((b) => b.status === "shipped");
  const withEst = moving.filter((b) => b.estimateFrom && b.estimateTo);
  const firstShip = order.shipped_at ? new Date(order.shipped_at) : null;
  const arrives = withEst.length
    ? span(withEst.map((b) => b.estimateFrom!).sort()[0], withEst.map((b) => b.estimateTo!).sort().at(-1)!)
    : firstShip ? span(addBusinessDays(firstShip, TRANSIT_DAYS.min), addBusinessDays(firstShip, TRANSIT_DAYS.max))
    : span(addBusinessDays(new Date(order.created_at), est.min), addBusinessDays(new Date(order.created_at), est.max));
  const deliveredOn = deliveredAt ?? live.map((b) => b.deliveredAt).filter(Boolean).sort().at(-1) ?? null;
  const madeOn = live.map((b) => b.shippedAt).filter(Boolean).sort()[0] ?? order.shipped_at;
  const steps = stage === "closed" ? [] : stepsFor(stage, { merch }, {
    ordered: shopDate(order.created_at), made: madeOn ? shopDate(madeOn) : null, shipped: madeOn ? shopDate(madeOn) : null,
    shipBy: ymdLabel(shipBy), arrives, delivered: deliveredOn ? shopDate(deliveredOn) : null,
  });

  // Boxes: Printful's (with steps), or the one an order marked shipped by hand.
  const trackOf = (num: string | null, url: string | null) => url || (num ? uspsTrackingUrl(num) : null);
  const boxes: ViewBox[] = live.map((b, i) => ({
    id: b.id, label: live.length > 1 ? `Box ${i + 1} of ${live.length}` : "Your box", carrier: b.carrier, tracking: b.trackingNumber, trackingUrl: trackOf(b.trackingNumber, b.trackingUrl),
    status: b.status,
    statusLine: b.status === "delivered" ? `Delivered ${b.deliveredAt ? dayLabel(b.deliveredAt) : ""}`.trim() : b.status === "returned" ? "Came back to our print partner" : b.estimateFrom && b.estimateTo ? `Arriving ${span(b.estimateFrom, b.estimateTo)}` : "On the way",
    events: b.events.slice(0, 4).map((e) => ({ text: e.text, at: new Intl.DateTimeFormat("en-US", { timeZone: SHOP.shipping.timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(e.at)) })),
    items: (b.items.length ? b.items : viewItems.map((x) => ({ sku: x.sku, quantity: x.quantity }))).map((x) => ({ name: itemBySku.get(x.sku)?.name ?? x.sku, image: itemBySku.get(x.sku)?.image ?? null, quantity: x.quantity })),
  }));
  if (!boxes.length && order.status === "shipped" && order.tracking_number) {
    boxes.push({ id: "manual", label: "Your box", carrier: order.carrier, tracking: order.tracking_number, trackingUrl: trackOf(order.tracking_number, order.tracking_url), status: "shipped", statusLine: `Arriving ${arrives}`, events: [], items: viewItems.map((x) => ({ name: x.name, image: x.image, quantity: x.quantity })) });
  }
  const inBoxes = new Map<string, number>();
  for (const b of live) for (const x of b.items) inBoxes.set(x.sku, (inBoxes.get(x.sku) ?? 0) + x.quantity);
  const waiting = live.length && live.every((b) => b.items.length)
    ? viewItems.filter((x) => (inBoxes.get(x.sku) ?? 0) < x.quantity).map((x) => ({ name: x.name, image: x.image, quantity: x.quantity - (inBoxes.get(x.sku) ?? 0) }))
    : [];

  const late = stage === "making" && today > shipBy;
  const carriers = [...new Set(live.map((b) => b.carrier).filter(Boolean))];
  const headline = stage === "closed" ? (order.status === "refunded" ? "Refunded" : "Canceled")
    : stage === "delivered" ? `Delivered ${deliveredOn ? dayLabel(deliveredOn) : ""}`.trim() : `Arriving ${arrives}`;
  const lede = stage === "making"
    ? late ? `It's running a little late: it was due to ship by ${shipByLabel}. We'll email the tracking link the moment it ships.`
      : merch ? `Our print partner is making your order now. It ships by ${shipByLabel}, and we'll email you the tracking link.` : `We're getting it ready. It ships by ${shipByLabel}, and we'll email you the tracking link.`
    : stage === "shipped" ? (boxes.length > 1 ? `Your order is coming in ${boxes.length} boxes.` : `It's on its way${carriers.length === 1 ? ` by ${carriers[0]}` : ""}.`) + (waiting.length ? " The rest ships separately." : "")
    : stage === "delivered" ? `Something not right? Report it within ${REPORT_DAYS} days with a photo. You don't need to send it back.`
    : order.refund_reason === "cant_ship_address" ? "We can't ship to that address, so we refunded it in full." : "We refunded this order in full. It can take 5 to 10 business days to show on your statement.";

  // Photos sit in a private bucket: this page gets links that last an hour (only people who may see the order get here).
  const photosOf = new Map(await Promise.all(requestsRaw.filter((r) => r.photos.length).map(async (r) => [r.id, await photoLinks(r.photos)] as const)));
  const requests: ViewRequest[] = requestsRaw.map((r) => ({
    id: r.id, kind: r.kind, line: r.kind === "problem" ? `${problemLabel(r.problem)[0].toUpperCase()}${problemLabel(r.problem).slice(1)}${r.wants ? `, you'd like a ${r.wants}` : ""}` : r.kind === "address" ? "New address" : "Your question",
    itemName: r.sku ? itemBySku.get(r.sku)?.name ?? null : null, sku: r.sku, wants: r.wants, status: r.status,
    statusLabel: r.status === "resolved" ? RESOLVED_LABEL[r.resolution ?? ""] ?? "Done" : STATUS_LABEL[r.status], body: r.body, photos: photosOf.get(r.id) ?? [],
    address: r.address ? formatAddress(r.address) : null, at: dayLabel(r.createdAt),
    messages: messages.filter((m) => m.requestId === r.id).map((m) => ({ from: m.from, body: m.body, at: dayLabel(m.at), name: m.name })),
  }));
  // Messages from us that aren't about a request show as their own thread.
  const loose = messages.filter((m) => !m.requestId);
  if (loose.length) requests.push({ id: "messages", kind: "question", line: "Messages", itemName: null, sku: null, wants: null, status: "open", statusLabel: "", body: null, photos: [], address: null, at: dayLabel(loose[0].at), messages: loose.map((m) => ({ from: m.from, body: m.body, at: dayLabel(m.at), name: m.name })) });

  const since = deliveredOn ?? order.shipped_at;
  const reportOpen = (stage === "shipped" || stage === "delivered") && (!since || Date.now() - Date.parse(since) <= (REPORT_DAYS + (deliveredOn ? 0 : 15)) * 86_400_000);

  return {
    id: order.id, code: orderCode(order.order_number), status: order.status, placedLabel: dayLabel(order.created_at),
    shipByLabel, afterCutoff: order.after_cutoff,
    items: viewItems,
    amountSubtotal: order.amount_subtotal, amountTax: order.amount_tax, amountTotal: order.amount_total, amountRefunded: order.amount_refunded ?? 0,
    amountShipping: Math.max(0, order.amount_total - order.amount_subtotal - order.amount_tax),
    shipTo: { name: order.ship_name, line1: order.ship_line1, line2: order.ship_line2, city: order.ship_city, state: order.ship_state, postal: order.ship_postal },
    tracking: order.tracking_number, trackingUrl: trackOf(order.tracking_number, order.tracking_url), carrier: order.carrier,
    shippedLabel: order.shipped_at ? dayLabel(order.shipped_at) : null, refundReason: order.refund_reason, timeline,
    digitalLists: digitalListsFor((items ?? []).map((i) => i.sku as string)),
    merch, stage, stageLabel: stageLabel(stage, { status: order.status, merch }), headline, lede, steps, boxes, waiting, requests,
    can: { report: reportOpen, address: stage === "making" && order.status === "paid", ask: stage !== "closed" || Date.now() - Date.parse(order.created_at) < 90 * 86_400_000 },
  };
}

export interface AccountOrderSummary { id: string; code: string; status: OrderRow["status"]; placedLabel: string; total: number; itemCount: number; stageLabel: string; image: string | null }

/** Orders this account placed, or that used its confirmed email. */
export async function accountOrders(userId: string, confirmedEmail: string | null): Promise<AccountOrderSummary[]> {
  const svc = createServiceClient();
  const filters = [`user_id.eq.${userId}`];
  // Exact match on the lowercased email (orders store it lowercased); ilike would treat "_" as a wildcard.
  if (confirmedEmail && /^[^\s@,()"]+@[^\s@,()"]+$/.test(confirmedEmail)) filters.push(`email.eq.${confirmedEmail.toLowerCase()}`);
  const { data } = await svc.from("shop_orders").select("id, order_number, status, amount_total, created_at, delivered_at, shop_order_items(sku, quantity)").or(filters.join(",")).order("created_at", { ascending: false }).limit(50);
  const rows = (data ?? []) as (Pick<OrderRow, "id" | "order_number" | "status" | "amount_total" | "created_at"> & { delivered_at: string | null; shop_order_items: { sku: string; quantity: number }[] })[];
  const skus = [...new Set(rows.flatMap((o) => (o.shop_order_items ?? []).map((i) => i.sku)))];
  const { data: products } = skus.length ? await svc.from("shop_products").select("sku, image_url, category").in("sku", skus) : { data: [] };
  const bySku = new Map(((products ?? []) as { sku: string; image_url: string | null; category: string }[]).map((p) => [p.sku, p]));
  return rows.map((o) => {
    const merch = (o.shop_order_items ?? []).some((i) => bySku.get(i.sku)?.category === MERCH_CATEGORY);
    const stage: Stage = o.status === "refunded" || o.status === "canceled" ? "closed" : o.delivered_at ? "delivered" : o.status === "shipped" ? "shipped" : "making";
    return {
      id: o.id, code: orderCode(o.order_number), status: o.status, placedLabel: dayLabel(o.created_at), total: o.amount_total,
      itemCount: (o.shop_order_items ?? []).reduce((n, i) => n + i.quantity, 0),
      stageLabel: stageLabel(stage, { status: o.status, merch }),
      image: (o.shop_order_items ?? []).map((i) => bySku.get(i.sku)?.image_url).find((x): x is string => !!x) ?? null,
    };
  });
}
