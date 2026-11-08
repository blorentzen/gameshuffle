import "server-only";

/**
 * Shop orders ↔ Printful (pick 14). A paid merch order becomes a Printful
 * draft (nothing is charged until it's confirmed); staff press Send to
 * Printful in Platform ▸ Shop ▸ Orders, or the printful_auto_confirm switch
 * sends it straight away. Printful's webhooks bring it back: shipped (tracking
 * from Printful, the buyer's shipped email once), held, failed, canceled.
 *
 * Test-mode orders (Stripe test checkouts on dev) never create anything in
 * Printful: they're priced with estimate-costs so the items and address are
 * still checked, and marked "test". Dev and production share one Printful
 * store, so a test draft would sit in the real dashboard.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { getPlatformFlag } from "@/lib/platform/flags";
import { getBaseUrl } from "@/lib/env";
import { sendShopPrintfulProblem, sendShopShipped } from "@/lib/email/shop";
import { orderEmailFacts } from "./orderEmail";
import { syncShipments, tellBuyer } from "./tracking";
import { SHOP } from "./config";
import { orderCode } from "./rules";
import { orderLinkToken } from "./access";
import { isMerchSku } from "./merch";
import { PERSONAL, fileKey } from "./personal";
import { picksFor } from "./orderPicks";
import {
  type PfOrderItem,
  PrintfulError, cancelOrder, confirmOrder, createOrder, estimateOrder, getOrder, printfulConfigured,
  type PfOrderInput, type PfShipment,
} from "./printful";

export type PrintfulStep = { ok: true; status: string; printfulOrderId: number | null } | { ok: false; error: string };

const money = (cents: number) => (cents / 100).toFixed(2);

async function event(orderId: string, detail: Record<string, unknown>, actor: string | null = null, visible = false) {
  await createServiceClient().from("shop_order_events").insert({ order_id: orderId, kind: "printful", visible, detail, actor_user_id: actor });
}

/** What Printful needs for an order: the address, each size and color's Printful id, and the totals for the packing slip. */
async function orderInput(orderId: string, opts: { only?: { sku: string; quantity: number }; reprint?: number } = {}): Promise<{ input: PfOrderInput; livemode: boolean; code: string; existing: number | null } | { error: string }> {
  const svc = createServiceClient();
  const { data: o } = await svc.from("shop_orders").select("*").eq("id", orderId).maybeSingle();
  if (!o) return { error: "not_found" };
  const { data: items } = await svc.from("shop_order_items").select("sku, quantity, unit_amount, refunded_quantity").eq("order_id", orderId);
  // A reprint (a problem report): only that item, as many as were reported, whatever was refunded.
  const merch = opts.only
    ? (items ?? []).filter((i) => i.sku === opts.only!.sku).map((i) => ({ ...i, quantity: Math.min(opts.only!.quantity, i.quantity as number), refunded_quantity: 0, unit_amount: 0 }))
    : (items ?? []).filter((i) => isMerchSku(i.sku as string) && (i.quantity as number) - ((i.refunded_quantity as number) ?? 0) > 0);
  if (!merch.length) return { error: "no_merch" };
  const { data: rows } = await svc.from("shop_products").select("sku, printful_sync_variant_id, printful_variant_id, printful_sync_product_id").in("sku", merch.map((i) => i.sku as string));
  const pfId = new Map((rows ?? []).map((r) => [r.sku as string, Number(r.printful_sync_variant_id)]));
  const rowOf = new Map((rows ?? []).map((r) => [r.sku as string, r]));
  if (merch.some((i) => !pfId.get(i.sku as string))) return { error: "unknown_item" };
  const picks = await picksFor(orderId);
  const pfItems: PfOrderItem[] = [];
  for (const i of merch) {
    const sku = i.sku as string;
    let left = (i.quantity as number) - ((i.refunded_quantity as number) ?? 0);
    const retail = money(i.unit_amount as number);
    const r = rowOf.get(sku)!;
    const personal = PERSONAL.products[String(r.printful_sync_product_id ?? "")];
    // A made-when-ordered product: each pick is its own line with that pick's print file. Refunded units come off the last picks.
    if (personal) {
      const mine = picks.filter((p) => p.sku === sku);
      if (!mine.length) return { error: "no_pick" };
      const counts = mine.map((p) => p.quantity);
      for (let k = counts.length - 1, over = counts.reduce((a, b) => a + b, 0) - left; k >= 0 && over > 0; k--) { const cut = Math.min(counts[k], over); counts[k] -= cut; over -= cut; }
      for (const [k, p] of mine.entries()) {
        if (counts[k] <= 0) continue;
        const file = PERSONAL.files[fileKey(personal.kind, personal.ink, p.pick)];
        if (!file) return { error: "no_pick_file" };
        const cap = personal.kind === "cap";
        pfItems.push({
          variant_id: Number(r.printful_variant_id), quantity: counts[k], retail_price: retail, external_id: `${sku}-${p.pick}`.slice(0, 32),
          files: [{ type: cap ? "embroidery_front" : "default", id: file.id, position: { ...personal.position, limit_to_print_area: true } }],
          ...(cap ? { options: [{ id: "embroidery_type", value: "flat" }, { id: "thread_colors", value: file.threads ?? ["#FFFFFF"] }] } : {}),
        });
        left -= counts[k];
      }
      continue;
    }
    pfItems.push({ sync_variant_id: pfId.get(sku)!, quantity: left, retail_price: retail, external_id: sku.slice(0, 32) });
  }
  if (!o.ship_line1 || !o.ship_city || !o.ship_state || !o.ship_postal) return { error: "no_address" };
  const subtotal = merch.reduce((n, i) => n + (i.unit_amount as number) * ((i.quantity as number) - ((i.refunded_quantity as number) ?? 0)), 0);
  const shipping = Math.max(0, (o.amount_total as number) - (o.amount_subtotal as number) - (o.amount_tax as number));
  const discount = Math.max(0, (o.amount_subtotal as number) + shipping + (o.amount_tax as number) - (o.amount_total as number));
  const code = orderCode(o.order_number as number);
  const livemode = !!o.livemode;
  const free = opts.reprint != null;
  const base = livemode ? `gs-${o.order_number}` : `test-gs-${o.order_number}-${orderId.slice(0, 6)}`;
  return {
    code, livemode, existing: free ? null : (o.printful_order_id as number | null) ?? null,
    input: {
      // One Printful store serves dev and production, so test orders get their own ids. A reprint is "-r1", "-r2"…
      external_id: (free ? `${base}-r${opts.reprint}` : base).slice(0, 32),
      recipient: {
        name: (o.ship_name as string) || "Customer", address1: o.ship_line1 as string, address2: (o.ship_line2 as string) || null,
        city: o.ship_city as string, state_code: o.ship_state as string, country_code: "US", zip: o.ship_postal as string,
        phone: (o.phone as string) || null, email: (o.email as string) || null,
      },
      items: pfItems,
      retail_costs: free
        ? { currency: "USD", subtotal: "0.00", discount: "0.00", shipping: "0.00", tax: "0.00", total: "0.00" }
        : { currency: "USD", subtotal: money(subtotal), discount: money(discount), shipping: money(shipping), tax: money(o.amount_tax as number), total: money(o.amount_total as number) },
      packing_slip: { email: SHOP.contact.support_email, store_name: "GameShuffle", custom_order_id: code, message: free ? "Sorry about the first one. This one's on us." : "Thanks for playing with GameShuffle." },
    },
  };
}

/**
 * After payment: create the Printful draft (or send it when the switch is on).
 * Once per order: an order that already has a Printful id is left alone.
 */
export async function createPrintfulDraft(orderId: string): Promise<PrintfulStep> {
  const svc = createServiceClient();
  const built = await orderInput(orderId);
  if ("error" in built) {
    if (built.error === "no_merch") return { ok: true, status: "none", printfulOrderId: null };
    await svc.from("shop_orders").update({ printful_status: "failed", printful_error: built.error }).eq("id", orderId);
    return { ok: false, error: built.error };
  }
  if (built.existing) return { ok: true, status: "exists", printfulOrderId: built.existing };
  if (!printfulConfigured()) {
    await svc.from("shop_orders").update({ printful_status: "failed", printful_error: "PRINTFUL_API_TOKEN is not set" }).eq("id", orderId);
    return { ok: false, error: "not_configured" };
  }

  if (!built.livemode) {
    try {
      const est = await estimateOrder(built.input);
      await svc.from("shop_orders").update({ printful_status: "test", printful_error: null }).eq("id", orderId);
      await event(orderId, { action: "estimated", costs: est.costs });
      return { ok: true, status: "test", printfulOrderId: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await svc.from("shop_orders").update({ printful_status: "failed", printful_error: msg.slice(0, 300) }).eq("id", orderId);
      await event(orderId, { action: "failed", error: msg.slice(0, 300) });
      return { ok: false, error: msg };
    }
  }

  // Claim the order so a second webhook delivery can't make a second draft.
  const { data: claimed } = await svc.from("shop_orders").update({ printful_status: "creating", printful_error: null })
    .eq("id", orderId).is("printful_order_id", null).or("printful_status.is.null,printful_status.eq.failed").select("id");
  if (!claimed?.length) return { ok: true, status: "busy", printfulOrderId: null };

  const auto = await getPlatformFlag("printful_auto_confirm", false);
  try {
    const pf = await createOrder(built.input, { confirm: auto });
    const now = new Date().toISOString();
    await svc.from("shop_orders").update({ printful_order_id: pf.id, printful_status: pf.status, printful_error: null, ...(auto ? { printful_sent_at: now } : {}) }).eq("id", orderId);
    await event(orderId, { action: auto ? "sent" : "draft", printful_order_id: pf.id, status: pf.status, costs: pf.costs ?? null });
    return { ok: true, status: pf.status, printfulOrderId: pf.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await svc.from("shop_orders").update({ printful_status: "failed", printful_error: msg.slice(0, 300) }).eq("id", orderId);
    await event(orderId, { action: "failed", error: msg.slice(0, 300) });
    await sendShopPrintfulProblem({ orderCode: built.code, what: "didn't take", reason: msg }).catch(() => {});
    return { ok: false, error: msg };
  }
}

/**
 * Staff: make a new Printful order for one item a buyer reported (order tracking picks 2026-11-08), at no charge to
 * them, sent to production straight away. Test orders are only priced. Returns the new Printful order's id.
 */
export async function reprintAtPrintful(orderId: string, only: { sku: string; quantity: number }, n: number, actor: string | null): Promise<PrintfulStep> {
  const built = await orderInput(orderId, { only, reprint: n });
  if ("error" in built) return { ok: false, error: built.error };
  if (!printfulConfigured()) return { ok: false, error: "not_configured" };
  try {
    if (!built.livemode) {
      const est = await estimateOrder(built.input);
      await event(orderId, { action: "reprint_estimated", sku: only.sku, costs: est.costs }, actor);
      return { ok: true, status: "test", printfulOrderId: null };
    }
    const pf = await createOrder(built.input, { confirm: true });
    await event(orderId, { action: "reprint_sent", sku: only.sku, printful_order_id: pf.id, status: pf.status, costs: pf.costs ?? null }, actor);
    return { ok: true, status: pf.status, printfulOrderId: pf.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await event(orderId, { action: "reprint_failed", sku: only.sku, error: msg.slice(0, 300) }, actor);
    return { ok: false, error: msg };
  }
}

/** Staff: confirm the draft for fulfillment (Printful charges for it now). */
export async function sendToPrintful(orderId: string, actor: string | null): Promise<PrintfulStep> {
  const svc = createServiceClient();
  const { data: o } = await svc.from("shop_orders").select("id, status, livemode, printful_order_id, printful_status").eq("id", orderId).maybeSingle();
  if (!o) return { ok: false, error: "not_found" };
  if (!o.livemode) return { ok: false, error: "test_order" };
  if (o.status !== "paid") return { ok: false, error: "not_paid" };
  if (!o.printful_order_id) {
    const made = await createPrintfulDraft(orderId);
    if (!made.ok || !made.printfulOrderId) return made.ok ? { ok: false, error: "no_draft" } : made;
    return sendToPrintful(orderId, actor);
  }
  if (o.printful_status && o.printful_status !== "draft" && o.printful_status !== "failed") return { ok: true, status: o.printful_status as string, printfulOrderId: o.printful_order_id as number };
  try {
    const pf = await confirmOrder(o.printful_order_id as number);
    await svc.from("shop_orders").update({ printful_status: pf.status, printful_error: null, printful_sent_at: new Date().toISOString() }).eq("id", orderId);
    await event(orderId, { action: "sent", printful_order_id: pf.id, status: pf.status, costs: pf.costs ?? null }, actor);
    return { ok: true, status: pf.status, printfulOrderId: pf.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await svc.from("shop_orders").update({ printful_error: msg.slice(0, 300) }).eq("id", orderId);
    await event(orderId, { action: "send_failed", error: msg.slice(0, 300) }, actor);
    return { ok: false, error: msg };
  }
}

/**
 * A full refund: delete the Printful draft, or cancel the order while Printful
 * still allows it. Once production starts Printful refuses, and the staff
 * screen says to sort it out in Printful.
 */
export async function cancelAtPrintful(orderId: string, actor: string | null): Promise<{ canceled: boolean; reason?: string }> {
  const svc = createServiceClient();
  const { data: o } = await svc.from("shop_orders").select("printful_order_id, printful_status").eq("id", orderId).maybeSingle();
  if (!o?.printful_order_id) return { canceled: false, reason: "none" };
  try {
    const pf = await cancelOrder(o.printful_order_id as number);
    await svc.from("shop_orders").update({ printful_status: pf?.status ?? "canceled" }).eq("id", orderId);
    await event(orderId, { action: "canceled", printful_order_id: o.printful_order_id }, actor);
    return { canceled: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await event(orderId, { action: "cancel_failed", error: msg.slice(0, 300) }, actor);
    return { canceled: false, reason: msg };
  }
}

/** Mark an order shipped from a Printful shipment: tracking and carrier from Printful, the buyer emailed once. */
async function shippedFromPrintful(orderId: string, shipment: PfShipment): Promise<void> {
  const svc = createServiceClient();
  const tracking = (shipment.tracking_number ?? "").replace(/\s+/g, "").slice(0, 60);
  const now = new Date().toISOString();
  const { data: rows } = await svc.from("shop_orders")
    .update({ status: "shipped", tracking_number: tracking || null, tracking_url: shipment.tracking_url || null, carrier: shipment.carrier || "USPS", shipped_at: now, updated_at: now })
    .eq("id", orderId).eq("status", "paid").select("id, order_number, email, ship_name");
  const o = rows?.[0];
  if (!o) {
    // Already shipped (a reshipment, or a second package): keep the newest tracking on the timeline.
    await svc.from("shop_orders").update({ tracking_number: tracking || null, tracking_url: shipment.tracking_url || null, carrier: shipment.carrier || "USPS", updated_at: now }).eq("id", orderId).eq("status", "shipped");
    await svc.from("shop_order_events").insert({ order_id: orderId, kind: shipment.reshipment ? "reshipped" : "updated", visible: true, detail: { tracking, carrier: shipment.carrier, url: shipment.tracking_url } });
    // Another box (part of the order, or a reprint): the buyer hears about it too.
    await tellBuyer(orderId, {
      subject: "Another box is on the way: order {code}", title: "Another box is on the way.", sub: shipment.carrier ? `By ${shipment.carrier}` : "Your order",
      paragraphs: ["Track it from your order page, where every box shows with its own tracking."],
      notice: "Another box for order {code} is on the way",
    });
    return;
  }
  await svc.from("shop_order_events").insert({ order_id: orderId, kind: "shipped", visible: true, detail: { tracking, carrier: shipment.carrier, url: shipment.tracking_url, by: "printful" } });
  const { data: claimed } = await svc.from("shop_orders").update({ shipped_email_sent_at: now }).eq("id", orderId).is("shipped_email_sent_at", null).select("id");
  if (claimed?.length && o.email) {
    await sendShopShipped({
      to: o.email as string, orderCode: orderCode(o.order_number as number), tracking, name: (o.ship_name as string) ?? null,
      carrier: shipment.carrier, trackingUrl: shipment.tracking_url,
      viewUrl: `${getBaseUrl()}/shop/orders/view?t=${encodeURIComponent(orderLinkToken(orderId))}`,
      facts: await orderEmailFacts(orderId, getBaseUrl()).catch(() => null),
    }).catch((e) => console.error("[printful] shipped email failed:", e));
  }
}

export interface PrintfulEvent { type?: string; store?: number; data?: { order?: { id?: number; external_id?: string }; shipment?: { id?: number }; reason?: string } }

/**
 * A Printful webhook. Nothing in it is trusted: the order is read back from
 * Printful and matched to ours by Printful's id. Returns what happened, for logs.
 */
export async function handlePrintfulEvent(ev: PrintfulEvent): Promise<string> {
  const type = ev.type ?? "";
  const pfId = Number(ev.data?.order?.id);
  if (!type.startsWith("package_") && !type.startsWith("order_")) return "ignored";
  if (!Number.isFinite(pfId) || pfId <= 0) return "no_order";
  const svc = createServiceClient();
  const { data: o } = await svc.from("shop_orders").select("id, order_number, status").eq("printful_order_id", pfId).maybeSingle();
  if (!o) return "unknown_order";
  let pf;
  try {
    pf = await getOrder(pfId);
  } catch (err) {
    if (err instanceof PrintfulError && err.code === "not_found") return "gone";
    throw err;
  }
  await svc.from("shop_orders").update({ printful_status: pf.status }).eq("id", o.id);
  const code = orderCode(o.order_number as number);
  const reason = typeof ev.data?.reason === "string" ? ev.data.reason.slice(0, 300) : null;

  if (type === "package_shipped") {
    const wanted = Number(ev.data?.shipment?.id);
    const shipment = (pf.shipments ?? []).find((s) => s.id === wanted) ?? (pf.shipments ?? []).at(-1);
    if (!shipment) return "no_shipment";
    await shippedFromPrintful(o.id as string, shipment);
    // The boxes with their items, tracking steps and arrival window (Printful API v2); best effort, the cron catches up.
    await syncShipments(o.id as string).catch((e) => console.warn("[printful] boxes:", e instanceof Error ? e.message : e));
    return "shipped";
  }
  if (type === "package_returned") {
    await syncShipments(o.id as string).catch((e) => console.warn("[printful] boxes:", e instanceof Error ? e.message : e));
    await event(o.id as string, { action: type, reason, status: pf.status });
    return type;
  }
  if (type === "order_failed" || type === "order_canceled" || type === "order_put_hold") {
    const what = type === "order_failed" ? "failed" : type === "order_canceled" ? "canceled" : "put a hold on";
    await svc.from("shop_orders").update({ printful_error: reason ?? what }).eq("id", o.id);
    await event(o.id as string, { action: type.replace("order_", ""), reason, status: pf.status });
    await sendShopPrintfulProblem({ orderCode: code, what, reason }).catch(() => {});
    return type;
  }
  if (type === "order_remove_hold") {
    await svc.from("shop_orders").update({ printful_error: null }).eq("id", o.id);
    await event(o.id as string, { action: "hold_removed", status: pf.status });
    return type;
  }
  await event(o.id as string, { action: type, reason, status: pf.status });
  return type;
}
