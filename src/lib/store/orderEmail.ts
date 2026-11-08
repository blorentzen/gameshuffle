import "server-only";

/**
 * What the order emails show (shop picks 2026-11-08: emails that build the excitement): the order's items with their
 * pictures, the totals, where the order is (ordered, being made, shipped, delivered, with dates), and for merch three
 * live products to pair with it. Read from the order itself, so the received email, a resend and the shipped email
 * all say the same thing. Every part is optional to the emails: they fall back to text when this can't be read.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { SHOP } from "./config";
import { formatPrice, shopDate } from "./copy";
import { MERCH_CATEGORY } from "./merch";
import { listMerchListings } from "./merchCatalog";
import { coverImage, pairsFor } from "./merchFilters";
import { nameWithPicks, picksFor } from "./orderPicks";
import { addBusinessDays, orderCode, shippingCents, shipByDay } from "./rules";

/** In transit after Printful ships, in business days (Printful's US Flat Rate: 3 to 4, up to 6; checked 2026-11-08). */
export const TRANSIT_DAYS = { min: 3, max: 6 };

export interface EmailLine { name: string; detail: string | null; quantity: number; amountCents: number; image: string | null }
export interface EmailPair { name: string; url: string; image: string | null; price: string }
export interface OrderEmailFacts {
  code: string;
  firstName: string | null;
  orderedOn: string;
  shipBy: string;
  /** "Nov 15 to 22": when it should arrive, from the order (not shipped yet) or from the shipping day. */
  arrives: string;
  shippedOn: string | null;
  lines: EmailLine[];
  totals: { subtotal: number; shipping: number; discount: number; tax: number; total: number };
  merch: boolean;
  pairs: EmailPair[];
}

const dayLabel = (ymd: string) => shopDate(`${ymd}T12:00:00-08:00`);
/** "Nov 15 to 22", or "Nov 28 to Dec 3" across a month. */
function span(a: string, b: string): string {
  const x = dayLabel(a), y = dayLabel(b);
  if (x === y) return x;
  return x.split(" ")[0] === y.split(" ")[0] ? `${x} to ${y.split(" ")[1]}` : `${x} to ${y}`;
}

export async function orderEmailFacts(orderId: string, base: string): Promise<OrderEmailFacts | null> {
  const svc = createServiceClient();
  const { data: o } = await svc.from("shop_orders")
    .select("order_number, created_at, shipped_at, amount_subtotal, amount_tax, amount_total, ship_name")
    .eq("id", orderId).maybeSingle();
  if (!o) return null;
  const { data: items } = await svc.from("shop_order_items").select("sku, quantity, unit_amount").eq("order_id", orderId);
  const rows = (items ?? []) as { sku: string; quantity: number; unit_amount: number }[];
  const [{ data: products }, picks] = await Promise.all([
    svc.from("shop_products").select("sku, name, image_url, listing_id, category").in("sku", rows.map((i) => i.sku)),
    picksFor(orderId),
  ]);
  const bySku = new Map(((products ?? []) as { sku: string; name: string; image_url: string | null; listing_id: string | null; category: string }[]).map((p) => [p.sku, p]));
  const lines: EmailLine[] = rows.map((i) => {
    const p = bySku.get(i.sku);
    // Merch rows are named "Tee · White · L": the name, then what was chosen.
    const [name, ...rest] = nameWithPicks(p?.name ?? i.sku, i.sku, picks).split(" · ");
    return { name, detail: rest.length ? rest.join(" · ") : null, quantity: i.quantity, amountCents: i.unit_amount * i.quantity, image: p?.image_url ?? null };
  });

  const orderedAt = new Date(o.created_at as string);
  const shippedAt = o.shipped_at ? new Date(o.shipped_at as string) : null;
  const est = SHOP.checkout.shipping_estimate_business_days;
  const arrives = shippedAt
    ? span(addBusinessDays(shippedAt, TRANSIT_DAYS.min), addBusinessDays(shippedAt, TRANSIT_DAYS.max))
    : span(addBusinessDays(orderedAt, est.min), addBusinessDays(orderedAt, est.max));

  const subtotal = Number(o.amount_subtotal) || 0;
  const tax = Number(o.amount_tax) || 0;
  const total = Number(o.amount_total) || 0;
  // Shipping is set from the subtotal when Checkout opens; whatever else is missing from the total is a promo code.
  const shipping = shippingCents(subtotal);
  const discount = Math.max(0, subtotal + shipping + tax - total);

  const merchListings = new Set([...bySku.values()].filter((p) => p.category === MERCH_CATEGORY && p.listing_id).map((p) => p.listing_id!));
  let pairs: EmailPair[] = [];
  if (merchListings.size) {
    const live = await listMerchListings().catch(() => []);
    const first = live.find((l) => merchListings.has(l.id));
    if (first) {
      pairs = pairsFor(first, live.filter((l) => !merchListings.has(l.id)), 3).map((l) => ({
        name: l.name,
        url: `${base}/shop/${l.slug}?utm_source=email&utm_medium=email&utm_campaign=order&utm_content=pair`,
        image: coverImage(l),
        price: l.priceVaries ? `From ${formatPrice(l.fromCents)}` : formatPrice(l.fromCents),
      }));
    }
  }

  return {
    code: orderCode(o.order_number as number),
    firstName: ((o.ship_name as string | null) ?? "").trim().split(/\s+/)[0] || null,
    orderedOn: shopDate(orderedAt.toISOString()),
    shipBy: dayLabel(shipByDay(orderedAt)),
    arrives,
    shippedOn: shippedAt ? shopDate(shippedAt.toISOString()) : null,
    lines,
    totals: { subtotal, shipping, discount, tax, total },
    merch: merchListings.size > 0,
    pairs,
  };
}
