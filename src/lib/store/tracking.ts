import "server-only";

/**
 * Order tracking (shop picks 2026-11-08, all as recommended): the boxes an order ships in, what buyers ask from their
 * order page, and the messages between them and us. Service role; the routes check who may act.
 *
 *   shipmentsFor / requestsFor / messagesFor   what an order page and the staff page show
 *   recordShipment     a box from Printful (shipped, delivered, came back), keyed by Printful's shipment id
 *   createRequest      a buyer: a problem (photos in a private bucket, replacement or refund), a question, or a new address
 *   buyerReply         a buyer adds to a request
 *   staffMessage       staff write to the buyer (email, site notice, the order page), and move the request on
 *   resolveRequest     staff close a request (reprinted, refunded, address changed, answered, declined)
 *   tellBuyer          the email and, for an account, the site notice for any update
 *
 * Messages are shop_order_events rows (kind 'message', visible). Before shop-tracking-m1.sql runs, the reads return
 * nothing and the writes answer not_ready.
 */

import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { getBaseUrl } from "@/lib/env";
import { createNotification } from "@/lib/social/notifications";
import { sendShopOrderUpdate, sendShopRequestAlert } from "@/lib/email/shop";
import { SHOP } from "./config";
import { orderCode, shipByDay } from "./rules";
import { shopDate } from "./copy";
import { getShipmentsV2, getOrder, updateOrderRecipient, PrintfulError, type PfV2Shipment } from "./printful";
import { reprintAtPrintful } from "./printfulOrders";
import { gsDay } from "@/lib/time/gsClock";
import { orderLinkToken } from "./access";
import { requestLine, type Problem, type RequestKind, type RequestStatus, type ShipmentStatus, type Wants } from "./orderStage";

export interface ShipmentRow {
  id: string; printfulShipmentId: number | null; carrier: string | null; service: string | null;
  trackingNumber: string | null; trackingUrl: string | null; status: ShipmentStatus;
  shippedAt: string | null; deliveredAt: string | null; estimateFrom: string | null; estimateTo: string | null;
  events: { at: string; text: string }[]; items: { sku: string; quantity: number }[]; reshipment: boolean;
}
export interface RequestRow {
  id: string; kind: RequestKind; status: RequestStatus; sku: string | null; problem: Problem | null; wants: Wants | null;
  body: string | null; photos: string[]; address: AddressInput | null; resolution: string | null; createdAt: string; resolvedAt: string | null;
}
export interface MessageRow { at: string; from: "buyer" | "staff"; body: string; requestId: string | null; name: string | null }
export interface AddressInput { name: string; line1: string; line2?: string | null; city: string; state: string; postal: string }

const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|Could not find the table/i.test(e.message ?? ""));

export async function shipmentsFor(orderId: string): Promise<ShipmentRow[]> {
  const { data, error } = await createServiceClient().from("shop_shipments").select("*").eq("order_id", orderId).order("created_at").abortSignal(new AbortController().signal);
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id, printfulShipmentId: r.printful_shipment_id ?? null, carrier: r.carrier, service: r.service, trackingNumber: r.tracking_number, trackingUrl: r.tracking_url,
    status: r.status, shippedAt: r.shipped_at, deliveredAt: r.delivered_at, estimateFrom: r.estimate_from, estimateTo: r.estimate_to,
    events: Array.isArray(r.events) ? r.events : [], items: Array.isArray(r.items) ? r.items : [], reshipment: !!r.reshipment,
  }));
}

export async function requestsFor(orderId: string): Promise<RequestRow[]> {
  const { data, error } = await createServiceClient().from("shop_order_requests").select("*").eq("order_id", orderId).order("created_at").abortSignal(new AbortController().signal);
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id, kind: r.kind, status: r.status, sku: r.sku, problem: r.problem, wants: r.wants, body: r.body, photos: r.photos ?? [],
    address: r.address ?? null, resolution: r.resolution, createdAt: r.created_at, resolvedAt: r.resolved_at,
  }));
}

export async function messagesFor(orderId: string): Promise<MessageRow[]> {
  const { data } = await createServiceClient().from("shop_order_events").select("detail, created_at").eq("order_id", orderId).eq("kind", "message").order("created_at").abortSignal(new AbortController().signal);
  return (data ?? []).map((e) => {
    const d = (e.detail ?? {}) as { from?: string; body?: string; request_id?: string | null; name?: string | null };
    return { at: e.created_at as string, from: d.from === "staff" ? "staff" : "buyer", body: d.body ?? "", requestId: d.request_id ?? null, name: d.name ?? null };
  });
}

/** The order's page for the buyer, signed, so the link in an email opens it on any device. */
export const buyerOrderUrl = (orderId: string) => `${getBaseUrl()}/shop/orders/view?t=${encodeURIComponent(orderLinkToken(orderId))}`;
const adminOrderUrl = (code: string) => `${getBaseUrl()}/admin/shop/${code}`;

type OrderBasics = { id: string; order_number: number; email: string | null; ship_name: string | null; user_id: string | null; status: string };
async function basics(orderId: string): Promise<OrderBasics | null> {
  const { data } = await createServiceClient().from("shop_orders").select("id, order_number, email, ship_name, user_id, status").eq("id", orderId).maybeSingle();
  return (data as OrderBasics | null) ?? null;
}

/** Email the buyer about their order and, when it belongs to an account, put the same update on the site. */
export async function tellBuyer(orderId: string, u: {
  subject: string; title: string; sub: string; paragraphs: string[]; quote?: string | null; notice: string;
  steps?: { label: string; date: string; state: "done" | "now" | "later" }[] | null;
}): Promise<void> {
  const o = await basics(orderId);
  if (!o) return;
  const code = orderCode(o.order_number);
  if (o.email) {
    await sendShopOrderUpdate({ to: o.email, name: o.ship_name, subject: u.subject.replace("{code}", code), title: u.title, sub: u.sub, paragraphs: u.paragraphs, quote: u.quote, steps: u.steps, viewUrl: buyerOrderUrl(orderId) })
      .catch((e) => console.error("[shop] update email failed:", e));
  }
  if (o.user_id) {
    await createNotification({ userId: o.user_id, type: "shop_order", title: u.notice.replace("{code}", code), link: `/shop/orders/${code}`, data: { order: code } })
      .catch((e) => console.error("[shop] notice failed:", e));
  }
}

// ─── boxes ──────────────────────────────────────────────────────────────────

/** A box from Printful: added the first time, then kept up to date (delivered, came back, tracking steps). Returns what changed. */
export async function recordShipment(orderId: string, s: {
  printfulShipmentId: number; carrier?: string | null; service?: string | null; trackingNumber?: string | null; trackingUrl?: string | null;
  status?: ShipmentStatus; shippedAt?: string | null; deliveredAt?: string | null; estimateFrom?: string | null; estimateTo?: string | null;
  events?: { at: string; text: string }[] | null; items?: { sku: string; quantity: number }[] | null; reshipment?: boolean;
}): Promise<{ created: boolean; delivered: boolean; returned: boolean } | null> {
  const svc = createServiceClient();
  const { data: had, error: readErr } = await svc.from("shop_shipments").select("id, status").eq("printful_shipment_id", s.printfulShipmentId).maybeSingle();
  if (missing(readErr)) return null;
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const set = (k: string, v: unknown) => { if (v !== undefined && v !== null) row[k] = v; };
  set("carrier", s.carrier); set("service", s.service); set("tracking_number", s.trackingNumber); set("tracking_url", s.trackingUrl);
  set("status", s.status); set("shipped_at", s.shippedAt); set("delivered_at", s.deliveredAt);
  set("estimate_from", s.estimateFrom); set("estimate_to", s.estimateTo);
  if (s.events?.length) row.events = s.events.slice(0, 30);
  if (s.items?.length) row.items = s.items;
  if (s.reshipment != null) row.reshipment = s.reshipment;
  if (!had) {
    const { error } = await svc.from("shop_shipments").insert({ order_id: orderId, printful_shipment_id: s.printfulShipmentId, status: s.status ?? "shipped", ...row });
    if (error && error.code !== "23505") throw new Error(`shop_shipments insert: ${error.message}`);
    return { created: !error, delivered: s.status === "delivered", returned: s.status === "returned" };
  }
  await svc.from("shop_shipments").update(row).eq("id", had.id);
  return { created: false, delivered: s.status === "delivered" && had.status !== "delivered", returned: s.status === "returned" && had.status !== "returned" };
}

// ─── requests ───────────────────────────────────────────────────────────────

const STATES = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" "));
/**
 * Buyer photos live in a private Supabase Storage bucket (shop-tracking-m1.sql makes it): no public link, no policy for
 * anyone but the service role. Rows keep the path ("<order id>/<uuid>.jpg"); pages get links that expire
 * (`photoLinks`), made only for people who may see the order.
 */
export const PHOTO_BUCKET = "shop-request-photos";
const PHOTO_LINK_SECONDS = 60 * 60;
const MAX_PHOTOS = 4;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };
/** Problems are reported within this many days of delivery (Terms and the shop's policies say 30). */
export const REPORT_DAYS = 30;

export function cleanAddress(a: Partial<AddressInput> | null | undefined): AddressInput | null {
  if (!a) return null;
  const t = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const out = { name: t(a.name, 80), line1: t(a.line1, 120), line2: t(a.line2, 120) || null, city: t(a.city, 80), state: t(a.state, 2).toUpperCase(), postal: t(a.postal, 10) };
  if (!out.name || !out.line1 || !out.city || !STATES.has(out.state) || !/^\d{5}(-\d{4})?$/.test(out.postal)) return null;
  return out;
}

export type RequestError = "not_ready" | "bad_kind" | "bad_item" | "bad_problem" | "too_late" | "not_yet" | "shipped" | "bad_address" | "empty" | "too_long" | "bad_photo" | "too_many" | "closed";

export async function createRequest(order: { id: string; status: string; shipped_at: string | null; delivered_at?: string | null }, input: {
  kind: string; sku?: string | null; problem?: string | null; wants?: string | null; body?: string | null; address?: Partial<AddressInput> | null;
}, photos: File[], fromUserId: string | null): Promise<{ ok: true; id: string } | { ok: false; error: RequestError }> {
  const svc = createServiceClient();
  const kind = input.kind as RequestKind;
  if (!["problem", "question", "address"].includes(kind)) return { ok: false, error: "bad_kind" };
  if (order.status === "refunded" || order.status === "canceled") return { ok: false, error: "closed" };
  const body = (input.body ?? "").trim();
  if (body.length > 2000) return { ok: false, error: "too_long" };
  const { data: open, error: openErr } = await svc.from("shop_order_requests").select("id, created_at").eq("order_id", order.id);
  if (missing(openErr)) return { ok: false, error: "not_ready" };
  if ((open ?? []).filter((r) => Date.now() - Date.parse(r.created_at as string) < 86_400_000).length >= 5) return { ok: false, error: "too_many" };

  const row: Record<string, unknown> = { order_id: order.id, kind, from_user_id: fromUserId, body: body || null };
  if (kind === "problem") {
    if (order.status !== "shipped") return { ok: false, error: "not_yet" };
    const since = order.delivered_at ?? order.shipped_at;
    if (since && Date.now() - Date.parse(since) > (REPORT_DAYS + (order.delivered_at ? 0 : 15)) * 86_400_000) return { ok: false, error: "too_late" };
    const { data: item } = await svc.from("shop_order_items").select("sku").eq("order_id", order.id).eq("sku", input.sku ?? "").maybeSingle();
    if (!item) return { ok: false, error: "bad_item" };
    if (!["misprinted", "damaged", "wrong", "missing"].includes(input.problem ?? "") || !["replacement", "refund"].includes(input.wants ?? "")) return { ok: false, error: "bad_problem" };
    row.sku = input.sku; row.problem = input.problem; row.wants = input.wants;
  } else if (kind === "address") {
    if (order.status !== "paid") return { ok: false, error: "shipped" };
    const address = cleanAddress(input.address);
    if (!address) return { ok: false, error: "bad_address" };
    row.address = address;
  } else if (!body) return { ok: false, error: "empty" };

  // Photos (problems): up to four pictures in the private bucket, stored with random names under the order's id.
  const paths: string[] = [];
  if (photos.length) {
    if (photos.length > MAX_PHOTOS) return { ok: false, error: "bad_photo" };
    for (const f of photos) if (!PHOTO_TYPES[f.type] || f.size > MAX_PHOTO_BYTES) return { ok: false, error: "bad_photo" };
    for (const f of photos) {
      const path = `${order.id}/${randomUUID()}.${PHOTO_TYPES[f.type]}`;
      const { error: upErr } = await svc.storage.from(PHOTO_BUCKET).upload(path, new Uint8Array(await f.arrayBuffer()), { contentType: f.type, upsert: false });
      if (upErr) { console.error("[shop] photo upload:", upErr.message); return { ok: false, error: /not found/i.test(upErr.message) ? "not_ready" : "bad_photo" }; }
      paths.push(path);
    }
  }
  row.photos = paths;
  const { data: made, error } = await svc.from("shop_order_requests").insert(row).select("id").single();
  if (missing(error)) return { ok: false, error: "not_ready" };
  if (error) throw new Error(`shop_order_requests insert: ${error.message}`);
  const line = requestLine({ kind, problem: input.problem, wants: input.wants });
  await svc.from("shop_order_events").insert({ order_id: order.id, kind: "request", visible: true, detail: { request_id: made.id, kind, line } });
  const o = await basics(order.id);
  if (o) {
    const code = orderCode(o.order_number);
    await sendShopRequestAlert({ orderCode: code, line, body: body || (row.address ? formatAddress(row.address as AddressInput) : null), adminUrl: adminOrderUrl(code) }).catch(() => {});
    const what = kind === "problem" ? "your report" : kind === "address" ? "your new address" : "your question";
    await tellBuyer(order.id, {
      subject: `We got ${what} on order {code}`, title: `We got ${what}.`, sub: `Order ${code}`,
      paragraphs: [
        kind === "problem" ? `Thanks for letting us know. We'll look at your photos and reply by email${input.wants === "replacement" ? " about your replacement" : ""}. You don't need to send anything back.`
          : kind === "address" ? "We'll change it with our print partner if your order isn't packed yet, and email you either way."
          : "We'll reply by email, and the answer shows on your order page too.",
      ],
      notice: `We got ${what} on order {code}`,
    });
  }
  return { ok: true, id: made.id as string };
}

/** Links to buyer photos that work for an hour, for a page whose viewer may see the order. Old full URLs pass through. */
export async function photoLinks(paths: string[]): Promise<string[]> {
  const own = paths.filter((p) => !/^https?:\/\//.test(p));
  if (!own.length) return paths;
  const { data } = await createServiceClient().storage.from(PHOTO_BUCKET).createSignedUrls(own, PHOTO_LINK_SECONDS);
  const signed = new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl]));
  return paths.map((p) => (/^https?:\/\//.test(p) ? p : signed.get(p) ?? "")).filter(Boolean);
}

export const formatAddress = (a: AddressInput) => [a.name, a.line1, a.line2, `${a.city}, ${a.state} ${a.postal}`].filter(Boolean).join(", ");

/** A buyer adds to their request: it goes back to staff as open. */
export async function buyerReply(orderId: string, requestId: string, body: string): Promise<{ ok: boolean; error?: RequestError }> {
  const text = body.trim();
  if (!text) return { ok: false, error: "empty" };
  if (text.length > 2000) return { ok: false, error: "too_long" };
  const svc = createServiceClient();
  const { data: r } = await svc.from("shop_order_requests").select("id, status, kind, problem, wants").eq("id", requestId).eq("order_id", orderId).maybeSingle();
  if (!r) return { ok: false, error: "bad_kind" };
  const { error: msgErr } = await svc.from("shop_order_events").insert({ order_id: orderId, kind: "message", visible: true, detail: { from: "buyer", body: text, request_id: requestId } });
  if (msgErr) { console.error("[shop] buyer message not saved (shop-tracking-m1.sql?):", msgErr.message); return { ok: false, error: "not_ready" }; }
  await svc.from("shop_order_requests").update({ status: "open", resolved_at: null, resolution: null, updated_at: new Date().toISOString() }).eq("id", requestId);
  const o = await basics(orderId);
  if (o) { const code = orderCode(o.order_number); await sendShopRequestAlert({ orderCode: code, line: `Reply on: ${requestLine(r as { kind: RequestKind })}`, body: text, adminUrl: adminOrderUrl(code) }).catch(() => {}); }
  return { ok: true };
}

/** Staff write to the buyer: by email, on the site for an account, and on the order page. A request moves to `status`. */
export async function staffMessage(orderId: string, m: { body: string; requestId?: string | null; status?: RequestStatus | null; resolution?: string | null; actor: string | null; name?: string | null }): Promise<{ ok: boolean; error?: string }> {
  const text = m.body.trim();
  if (!text) return { ok: false, error: "empty" };
  if (text.length > 4000) return { ok: false, error: "too_long" };
  const svc = createServiceClient();
  const { error: msgErr } = await svc.from("shop_order_events").insert({ order_id: orderId, kind: "message", visible: true, actor_user_id: m.actor, detail: { from: "staff", body: text, request_id: m.requestId ?? null, name: m.name ?? null } });
  if (msgErr) { console.error("[shop] staff message not saved (shop-tracking-m1.sql?):", msgErr.message); return { ok: false, error: "not_ready" }; }
  if (m.requestId && m.status) {
    const done = m.status === "resolved";
    await svc.from("shop_order_requests").update({ status: m.status, ...(done ? { resolved_at: new Date().toISOString(), resolution: m.resolution ?? "answered" } : {}), updated_at: new Date().toISOString() })
      .eq("id", m.requestId).eq("order_id", orderId);
  }
  await tellBuyer(orderId, {
    subject: "A message about order {code}", title: "A message from GameShuffle", sub: "About your order", paragraphs: ["Reply to this email, or answer from your order page."], quote: text,
    notice: "GameShuffle sent a message about order {code}",
  });
  return { ok: true };
}

/** Staff close a request without a message (the message, if any, went with staffMessage). */
export async function resolveRequest(orderId: string, requestId: string, resolution: string, actor: string | null): Promise<void> {
  const svc = createServiceClient();
  await svc.from("shop_order_requests").update({ status: "resolved", resolution, resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", requestId).eq("order_id", orderId);
  await svc.from("shop_order_events").insert({ order_id: orderId, kind: "request_resolved", visible: false, actor_user_id: actor, detail: { request_id: requestId, resolution } });
}

// ─── Printful's boxes, read back ────────────────────────────────────────────

/** A Printful v2 shipment as one of our boxes (null while it isn't on its way yet: pending, packaged, on hold). */
export function boxFromPrintful(s: PfV2Shipment, skus: string[]): Parameters<typeof recordShipment>[1] | null {
  const delivered = s.delivery_status === "delivered" || !!s.delivered_at;
  const returned = s.shipment_status === "returned" || s.delivery_status === "return_to_sender";
  const canceled = s.shipment_status === "canceled";
  if (!delivered && !returned && !canceled && !s.shipped_at && s.shipment_status !== "shipped") return null;
  // Our line ids: the sku, or "sku-pick" for a made-when-ordered pick (printfulOrders.ts).
  const skuOf = (ext: string | null) => (ext ? skus.find((k) => ext === k || ext.startsWith(`${k}-`)) ?? null : null);
  const items = new Map<string, number>();
  for (const it of s.shipment_items ?? []) { const k = skuOf(it.order_item_external_id); if (k) items.set(k, (items.get(k) ?? 0) + (it.quantity || 0)); }
  return {
    printfulShipmentId: s.id, carrier: s.carrier, service: s.service, trackingNumber: s.tracking_number, trackingUrl: s.tracking_url,
    status: canceled ? "canceled" : returned ? "returned" : delivered ? "delivered" : "shipped",
    shippedAt: s.shipped_at, deliveredAt: s.delivered_at,
    estimateFrom: s.estimated_delivery?.from_date?.slice(0, 10) ?? null, estimateTo: s.estimated_delivery?.to_date?.slice(0, 10) ?? null,
    events: [...(s.tracking_events ?? [])].filter((e) => e.triggered_at && e.description).sort((a, b) => Date.parse(b.triggered_at) - Date.parse(a.triggered_at)).map((e) => ({ at: e.triggered_at, text: e.description.slice(0, 160) })),
    items: [...items].map(([sku, quantity]) => ({ sku, quantity })), reshipment: !!s.is_reshipment,
  };
}

/**
 * Read an order's boxes from Printful and keep ours up to date. When the last box is delivered the order gets its
 * delivered date and the buyer a "Delivered" email; a box that came back tells the buyer and shows on the staff queue.
 */
export async function syncShipments(orderId: string): Promise<{ boxes: number; delivered: boolean; returned: boolean } | null> {
  const svc = createServiceClient();
  const { data: o } = await svc.from("shop_orders").select("id, printful_order_id, status, delivered_at").eq("id", orderId).maybeSingle();
  if (!o?.printful_order_id) return null;
  let pf: PfV2Shipment[];
  try { pf = await getShipmentsV2(o.printful_order_id as number); } catch (err) {
    if (err instanceof PrintfulError && err.code === "not_found") return { boxes: 0, delivered: false, returned: false };
    throw err;
  }
  const { data: items } = await svc.from("shop_order_items").select("sku, quantity").eq("order_id", orderId);
  const skus = (items ?? []).map((i) => i.sku as string).sort((a, b) => b.length - a.length);
  let returned = false;
  for (const s of pf) {
    const box = boxFromPrintful(s, skus);
    if (!box) continue;
    const r = await recordShipment(orderId, box);
    if (r === null) return null;
    if (r.returned) returned = true;
  }
  if (returned) {
    await svc.from("shop_order_events").insert({ order_id: orderId, kind: "returned", visible: true, detail: { by: "printful" } });
    await tellBuyer(orderId, {
      subject: "Your package came back: order {code}", title: "Your package came back.", sub: "The carrier couldn't deliver it",
      paragraphs: ["The carrier sent your package back to our print partner. Check the address on your order page and reply to this email, and we'll sort out sending it again."],
      notice: "Your package for order {code} came back. Check your address.",
    });
  }
  // Delivered: every box (that wasn't canceled) delivered, and the boxes hold the whole order.
  const boxes = await shipmentsFor(orderId);
  const live = boxes.filter((b) => b.status !== "canceled");
  const units = (items ?? []).reduce((n, i) => n + (i.quantity as number), 0);
  const inBoxes = live.reduce((n, b) => n + b.items.reduce((m, i) => m + i.quantity, 0), 0);
  const whole = live.some((b) => !b.items.length) || inBoxes >= units;
  let delivered = false;
  if (!o.delivered_at && live.length && whole && live.every((b) => b.status === "delivered")) {
    const at = live.map((b) => b.deliveredAt).filter(Boolean).sort().at(-1) ?? new Date().toISOString();
    const { data: claimed } = await svc.from("shop_orders").update({ delivered_at: at }).eq("id", orderId).is("delivered_at", null).select("id");
    if (claimed?.length) {
      delivered = true;
      await svc.from("shop_order_events").insert({ order_id: orderId, kind: "delivered", visible: true, detail: { at } });
      await tellBuyer(orderId, {
        subject: "Delivered: order {code}", title: "Delivered.", sub: `Your order arrived ${shopDate(at, { weekday: true })}`,
        paragraphs: [`If something isn't right with an item, report it from your order page within ${REPORT_DAYS} days with a photo. You don't need to send it back.`],
        notice: "Order {code} was delivered",
      });
    }
  }
  return { boxes: live.length, delivered, returned };
}

/**
 * Every few hours (vercel.json): boxes still on their way are read back from Printful, and a paid order past the
 * day it was due to ship gets one "running late" email.
 */
export async function runShopTracking(): Promise<{ checked: number; delivered: number; returned: number; late: number }> {
  const svc = createServiceClient();
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const { data: moving, error } = await svc.from("shop_orders").select("id").eq("status", "shipped").is("delivered_at", null).not("printful_order_id", "is", null)
    .gte("created_at", since).order("shipped_at", { ascending: true }).limit(60);
  if (missing(error)) return { checked: 0, delivered: 0, returned: 0, late: 0 };
  let delivered = 0, returned = 0;
  for (const o of moving ?? []) {
    const r = await syncShipments(o.id as string).catch((e) => { console.error("[shop] sync boxes:", e); return null; });
    if (r?.delivered) delivered++;
    if (r?.returned) returned++;
  }
  // Running late: once per order, the day after it was due to ship.
  const today = gsDay();
  const { data: paid } = await svc.from("shop_orders").select("id, created_at").eq("status", "paid").eq("livemode", true).is("late_emailed_at", null).gte("created_at", since).limit(200);
  let late = 0;
  for (const o of paid ?? []) {
    const due = shipByDay(new Date(o.created_at as string));
    if (today <= due) continue;
    const { data: claimed } = await svc.from("shop_orders").update({ late_emailed_at: new Date().toISOString() }).eq("id", o.id).is("late_emailed_at", null).select("id");
    if (!claimed?.length) continue;
    late++;
    await svc.from("shop_order_events").insert({ order_id: o.id, kind: "late", visible: true, detail: { due } });
    await tellBuyer(o.id as string, {
      subject: "Order {code} is running late", title: "Your order is running a little late.", sub: `It was due to ship by ${shopDate(`${due}T12:00:00-08:00`, { weekday: true })}`,
      paragraphs: ["Our print partner is still making it. We'll email the tracking link the moment it ships, and you can see where it is on your order page any time."],
      notice: "Order {code} is running a little late",
    });
  }
  return { checked: (moving ?? []).length, delivered, returned, late };
}

// ─── staff actions on a request ─────────────────────────────────────────────

/**
 * Reprint the item a buyer reported, at no charge to them: a new Printful order for it, sent to production. The
 * request is resolved and the buyer told. Test orders are only priced (nothing is made).
 */
export async function reprintRequest(orderId: string, requestId: string, actor: string | null): Promise<{ ok: true; test: boolean } | { ok: false; error: string }> {
  const svc = createServiceClient();
  const { data: r } = await svc.from("shop_order_requests").select("id, sku, kind, status").eq("id", requestId).eq("order_id", orderId).maybeSingle();
  if (!r || r.kind !== "problem" || !r.sku) return { ok: false, error: "bad_request" };
  if (r.status === "resolved") return { ok: false, error: "resolved" };
  const { count } = await svc.from("shop_order_requests").select("id", { count: "exact", head: true }).eq("order_id", orderId).not("reprint_printful_id", "is", null);
  const step = await reprintAtPrintful(orderId, { sku: r.sku as string, quantity: 1 }, (count ?? 0) + 1, actor);
  if (!step.ok) return { ok: false, error: step.error };
  const now = new Date().toISOString();
  await svc.from("shop_order_requests").update({ status: "resolved", resolution: "reprinted", reprint_printful_id: step.printfulOrderId, resolved_at: now, updated_at: now }).eq("id", requestId);
  await svc.from("shop_order_events").insert({ order_id: orderId, kind: "reprinted", visible: true, actor_user_id: actor, detail: { request_id: requestId, sku: r.sku, printful_order_id: step.printfulOrderId } });
  await tellBuyer(orderId, {
    subject: "We're making you a new one: order {code}", title: "We're making you a new one.", sub: "At no charge to you",
    paragraphs: ["Thanks for the photos. Our print partner is making a replacement now, and we'll email the tracking link when it ships. You don't need to send the first one back."],
    notice: "A replacement for order {code} is being made",
  });
  return { ok: true, test: step.status === "test" };
}

/**
 * Use the address a buyer asked for: on our order, and at Printful while it still allows changes (a draft or a failed
 * order). Once Printful has started, it answers printful_locked and nothing changes; staff reply instead.
 */
export async function applyAddressRequest(orderId: string, requestId: string, actor: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const svc = createServiceClient();
  const { data: r } = await svc.from("shop_order_requests").select("id, kind, status, address").eq("id", requestId).eq("order_id", orderId).maybeSingle();
  const a = cleanAddress((r?.address ?? null) as Partial<AddressInput> | null);
  if (!r || r.kind !== "address" || !a) return { ok: false, error: "bad_request" };
  const { data: o } = await svc.from("shop_orders").select("status, phone, email, printful_order_id, livemode").eq("id", orderId).maybeSingle();
  if (!o || o.status !== "paid") return { ok: false, error: "shipped" };
  if (o.printful_order_id && o.livemode) {
    try {
      const pf = await getOrder(o.printful_order_id as number);
      if (!["draft", "failed"].includes(pf.status)) return { ok: false, error: "printful_locked" };
      await updateOrderRecipient(o.printful_order_id as number, { name: a.name, address1: a.line1, address2: a.line2 ?? null, city: a.city, state_code: a.state, country_code: "US", zip: a.postal, phone: (o.phone as string) || null, email: (o.email as string) || null });
    } catch (err) {
      return { ok: false, error: err instanceof PrintfulError ? `printful: ${err.message}` : "printful" };
    }
  }
  const now = new Date().toISOString();
  await svc.from("shop_orders").update({ ship_name: a.name, ship_line1: a.line1, ship_line2: a.line2 ?? null, ship_city: a.city, ship_state: a.state, ship_postal: a.postal, updated_at: now }).eq("id", orderId);
  await svc.from("shop_order_requests").update({ status: "resolved", resolution: "address_changed", resolved_at: now, updated_at: now }).eq("id", requestId);
  await svc.from("shop_order_events").insert({ order_id: orderId, kind: "address_changed", visible: true, actor_user_id: actor, detail: { request_id: requestId } });
  await tellBuyer(orderId, {
    subject: "New address saved: order {code}", title: "Your new address is saved.", sub: formatAddress(a),
    paragraphs: ["Your order will ship there. We'll email the tracking link when it's on the way."],
    notice: "The new address for order {code} is saved",
  });
  return { ok: true };
}

/** The shop's support line, for the order page and the emails. */
export const supportEmail = () => SHOP.contact.support_email;
