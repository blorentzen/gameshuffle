/**
 * POST /api/shop/checkout { items: [{ sku, quantity, pick? }], source?, utm? }
 *   → { ok: true, url } (Stripe Checkout) or { ok: false, error, sku?, available? }
 *
 * The whole cart in one session. Stock is held first (shop_reserve, row
 * locks), for exactly the cart's quantities; if any line can't be covered,
 * nothing is held and the cart hears which product and how many are left.
 * Quantities are fixed inside Stripe (no adjustable quantities or optional
 * items) because hosted Checkout can't change the shipping price after it
 * opens, and shipping depends on the subtotal: $4.99 under $25, free from $25.
 *
 * Merch (made to order, from Printful) has no Stripe Price per size and
 * color: those lines are priced inline (price_data) with the sku on the
 * product's metadata, Stripe Tax's clothing code for apparel, and Printful's
 * picture. They take a large made-to-order stock, so holds never run short.
 *
 * Made-when-ordered merch carries the buyer's pick (personal.ts): checked
 * against what that product offers, held per product like any other line, and
 * sent to Stripe as its own line ("Player Tee · Player 2 · 4 hearts") with the
 * pick on the product's metadata, which is how the order learns it.
 *
 * Guest checkout with customer_email and client_reference_id when signed in;
 * never the Pro stripe_customer_id (the US-only backstop refunds by customer).
 * Hidden like the page until shop_open is on (staff can always test).
 */

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getPlatformFlag } from "@/lib/platform/flags";
import { isStaffRequest } from "@/lib/auth/raw";
import { rateLimit } from "@/lib/ratelimit";
import { getBaseUrl } from "@/lib/env";
import { SHOP, SHOP_METADATA_KIND, SHOP_TAX_CODE } from "@/lib/store/config";
import { MERCH_CATEGORY } from "@/lib/store/merch";
import { listShopProducts, ShopNotReady } from "@/lib/store/products";
import { shippingCents } from "@/lib/store/rules";
import { shopCopy } from "@/lib/store/copy";
import { isValidPick, pickLabel } from "@/lib/store/personal";

export const runtime = "nodejs";

const UTM_KEYS = ["source", "medium", "campaign", "content"] as const;
/** Stripe Tax: "Clothing & Footwear", apparel for general use. */
const CLOTHING_TAX_CODE = "txcd_30011000";
const clean = (v: unknown, max = 60) => (typeof v === "string" && /^[\w./:-]{1,200}$/.test(v) ? v.slice(0, max) : null);
const fail = (error: string, status = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ ok: false, error, ...extra }, { status });

export async function POST(request: Request) {
  const [open, staff] = await Promise.all([getPlatformFlag("shop_open", false), isStaffRequest()]);
  if (!open && !staff) return fail("closed", 404);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await rateLimit(`shop-checkout:${ip}`, { max: 8, windowMs: 10 * 60_000 })).ok) return fail("rate_limited", 429);

  const body = (await request.json().catch(() => null)) as { items?: { sku?: unknown; quantity?: unknown; pick?: unknown }[]; source?: unknown; utm?: Record<string, unknown> } | null;
  // One entry per product and pick; a product's lines are held together.
  const picked = new Map<string, { sku: string; pick: string | null; quantity: number }>();
  for (const i of Array.isArray(body?.items) ? body!.items.slice(0, 20) : []) {
    const sku = typeof i?.sku === "string" ? i.sku : "";
    const qty = Number(i?.quantity);
    const pick = typeof i?.pick === "string" && /^[a-z0-9-]{1,24}$/.test(i.pick) ? i.pick : null;
    if (!/^[a-z0-9-]{2,40}$/.test(sku) || !Number.isInteger(qty) || qty < 1) continue;
    const key = pick ? `${sku}|${pick}` : sku;
    picked.set(key, { sku, pick, quantity: (picked.get(key)?.quantity ?? 0) + qty });
  }
  const merged = new Map<string, number>();
  for (const e of picked.values()) merged.set(e.sku, (merged.get(e.sku) ?? 0) + e.quantity);
  if (merged.size === 0) return fail("empty_cart");

  let products;
  try {
    products = await listShopProducts();
  } catch (err) {
    if (err instanceof ShopNotReady) return fail("not_ready", 503);
    throw err;
  }
  const bySku = new Map(products.map((p) => [p.sku, p]));
  const lines: { sku: string; quantity: number; price: string | null; unitCents: number; name: string; image: string | null; listingId: string | null }[] = [];
  for (const [sku, qty] of merged) {
    const p = bySku.get(sku);
    const merch = p?.category === MERCH_CATEGORY;
    if (!p || !p.onSale || (!p.stripePriceId && !merch)) return fail("unavailable", 409, { sku, name: p?.name ?? null });
    lines.push({ sku, quantity: Math.min(qty, p.maxPerOrder), price: merch ? null : p.stripePriceId, unitCents: p.priceCents, name: p.name, image: p.imageUrl, listingId: p.listingId });
  }
  // Made when ordered: every line of such a product needs a pick it offers; nothing else takes one.
  const stripeLines: { sku: string; pick: string | null; label: string | null; quantity: number }[] = [];
  for (const e of picked.values()) {
    const p = bySku.get(e.sku)!;
    if (p.personal ? !e.pick || !isValidPick(p.personal.kind, p.personal.ink, e.pick) : !!e.pick) return fail("bad_pick", 400, { sku: e.sku, name: p.name });
    stripeLines.push({ sku: e.sku, pick: e.pick, label: p.personal && e.pick ? pickLabel(p.personal.kind, e.pick) : null, quantity: e.quantity });
  }
  // The per-order limit applies to a product across its picks.
  for (const l of lines) {
    let left = l.quantity;
    for (const s of stripeLines.filter((x) => x.sku === l.sku)) { s.quantity = Math.min(s.quantity, left); left -= s.quantity; }
  }

  // Session: 30 minutes is Stripe's floor, so add a minute for the round trip.
  // Holds outlast it by a grace period so a payment made in the last second
  // keeps its stock until the webhook lands; checkout.session.expired
  // releases abandoned holds right away.
  const sessionSeconds = Math.max(SHOP.checkout.session_minutes, 30) * 60 + 60;
  const expiresAt = new Date(Date.now() + sessionSeconds * 1000);
  const holdUntil = new Date(expiresAt.getTime() + SHOP.checkout.hold_grace_minutes * 60_000);
  const holdGroup = randomUUID();
  const svc = createServiceClient();
  const releaseGroup = () => svc.from("shop_stock_holds").update({ released_at: new Date().toISOString() }).eq("hold_group", holdGroup).is("released_at", null);

  const { data: reserved, error: reserveError } = await svc.rpc("shop_reserve", {
    p_hold_group: holdGroup,
    p_items: lines.map((l) => ({ sku: l.sku, quantity: l.quantity, required: true })),
    p_expires_at: holdUntil.toISOString(),
  });
  if (reserveError) { console.error("[shop/checkout] reserve:", reserveError.message); return fail("checkout_failed", 500); }
  const r = reserved as { ok: boolean; reason?: string; sku?: string; available?: number; granted?: Record<string, number> };
  if (!r.ok) {
    await releaseGroup();
    return fail(r.reason === "sold_out" ? "sold_out" : "unavailable", 409, { sku: r.sku, name: bySku.get(r.sku ?? "")?.name ?? null, available: r.available ?? 0 });
  }
  const short = lines.find((l) => (r.granted?.[l.sku] ?? 0) < l.quantity);
  if (short) {
    await releaseGroup();
    return fail("not_enough", 409, { sku: short.sku, name: short.name, available: r.granted?.[short.sku] ?? 0 });
  }

  // Apparel takes Stripe Tax's clothing code; everything else is general goods.
  const listingIds = [...new Set(lines.map((l) => l.listingId).filter((x): x is string => !!x))];
  const itemTypes = new Map<string, string>();
  if (listingIds.length) {
    const { data: ls } = await svc.from("shop_listings").select("id, item_type").in("id", listingIds);
    for (const l of ls ?? []) itemTypes.set(l.id as string, l.item_type as string);
  }
  const taxCode = (listingId: string | null) => (["Tees", "Hoodies", "Hats"].includes(itemTypes.get(listingId ?? "") ?? "") ? CLOTHING_TAX_CODE : SHOP_TAX_CODE);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const subtotal = lines.reduce((n, l) => n + l.unitCents * l.quantity, 0);
  const shipping = shippingCents(subtotal);
  const rate = SHOP.shipping.rate;
  const base = getBaseUrl();
  const copy = shopCopy();
  const utm: Record<string, string> = {};
  for (const k of UTM_KEYS) { const v = clean(body?.utm?.[k]); if (v) utm[`utm_${k}`] = v; }
  const sourcePage = clean(body?.source, 120) ?? "/shop";

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: stripeLines.filter((s) => s.quantity > 0).map((s) => {
        const l = lines.find((x) => x.sku === s.sku)!;
        return l.price
          ? { price: l.price, quantity: s.quantity }
          : {
              quantity: s.quantity,
              price_data: {
                currency: SHOP.currency, unit_amount: l.unitCents, tax_behavior: "exclusive" as const,
                product_data: {
                  name: s.label ? `${l.name} · ${s.label}` : l.name, tax_code: taxCode(l.listingId),
                  ...(l.image?.startsWith("https://") ? { images: [l.image] } : {}),
                  metadata: { gs_kind: SHOP_METADATA_KIND, sku: l.sku, ...(s.pick ? { pick: s.pick } : {}) },
                },
              },
            };
      }),
      shipping_address_collection: { allowed_countries: SHOP.checkout.allowed_countries as ["US"] },
      // Phone for order lookup by text (Britton, 2026-10-09); Stripe makes it required.
      phone_number_collection: { enabled: true },
      shipping_options: [{
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: shipping, currency: SHOP.currency },
          display_name: shipping === 0 ? rate.free_label : rate.standard_label,
          delivery_estimate: {
            minimum: { unit: "business_day", value: SHOP.checkout.shipping_estimate_business_days.min },
            maximum: { unit: "business_day", value: SHOP.checkout.shipping_estimate_business_days.max },
          },
          tax_behavior: "exclusive",
          tax_code: rate.tax_code,
        },
      }],
      automatic_tax: { enabled: SHOP.checkout.automatic_tax },
      allow_promotion_codes: SHOP.checkout.allow_promotion_codes,
      payment_method_types: ["card"],
      expires_at: Math.floor(expiresAt.getTime() / 1000),
      ...(user?.email ? { customer_email: user.email } : {}),
      ...(user ? { client_reference_id: user.id } : {}),
      metadata: { gs_kind: SHOP_METADATA_KIND, hold_group: holdGroup, source_page: sourcePage, ...utm },
      payment_intent_data: { metadata: { gs_kind: SHOP_METADATA_KIND, hold_group: holdGroup }, description: "GameShuffle Shop order" },
      custom_text: { submit: { message: `${copy.cart.checkoutNote} [${copy.shipping.policiesLink}](${base}/shop/policies)` } },
      success_url: `${base}/shop/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/shop?checkout=canceled`,
    });
    await svc.from("shop_stock_holds").update({ checkout_session_id: session.id }).eq("hold_group", holdGroup);
    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    console.error("[shop/checkout] session:", err instanceof Error ? err.message : err);
    await releaseGroup();
    return fail("checkout_failed", 500);
  }
}
