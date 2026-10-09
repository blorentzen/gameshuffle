/**
 * POST /api/shop/checkout { items: [{ sku, quantity }], source?, utm? }
 *   → { ok: true, url } (Stripe Checkout) or { ok: false, error, sku?, available? }
 *
 * The whole cart in one session. Stock is held first (shop_reserve, row
 * locks), for exactly the cart's quantities; if any line can't be covered,
 * nothing is held and the cart hears which product and how many are left.
 * Quantities are fixed inside Stripe (no adjustable quantities or optional
 * items) because hosted Checkout can't change the shipping price after it
 * opens, and shipping depends on the subtotal: $4.99 under $25, free from $25.
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
import { SHOP, SHOP_METADATA_KIND } from "@/lib/store/config";
import { listShopProducts, ShopNotReady } from "@/lib/store/products";
import { shippingCents } from "@/lib/store/rules";
import { shopCopy } from "@/lib/store/copy";

export const runtime = "nodejs";

const UTM_KEYS = ["source", "medium", "campaign", "content"] as const;
const clean = (v: unknown, max = 60) => (typeof v === "string" && /^[\w./:-]{1,200}$/.test(v) ? v.slice(0, max) : null);
const fail = (error: string, status = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ ok: false, error, ...extra }, { status });

export async function POST(request: Request) {
  const [open, staff] = await Promise.all([getPlatformFlag("shop_open", false), isStaffRequest()]);
  if (!open && !staff) return fail("closed", 404);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await rateLimit(`shop-checkout:${ip}`, { max: 8, windowMs: 10 * 60_000 })).ok) return fail("rate_limited", 429);

  const body = (await request.json().catch(() => null)) as { items?: { sku?: unknown; quantity?: unknown }[]; source?: unknown; utm?: Record<string, unknown> } | null;
  const merged = new Map<string, number>();
  for (const i of Array.isArray(body?.items) ? body!.items.slice(0, 20) : []) {
    const sku = typeof i?.sku === "string" ? i.sku : "";
    const qty = Number(i?.quantity);
    if (!/^[a-z0-9-]{2,40}$/.test(sku) || !Number.isInteger(qty) || qty < 1) continue;
    merged.set(sku, (merged.get(sku) ?? 0) + qty);
  }
  if (merged.size === 0) return fail("empty_cart");

  let products;
  try {
    products = await listShopProducts();
  } catch (err) {
    if (err instanceof ShopNotReady) return fail("not_ready", 503);
    throw err;
  }
  const bySku = new Map(products.map((p) => [p.sku, p]));
  const lines: { sku: string; quantity: number; price: string; unitCents: number; name: string }[] = [];
  for (const [sku, qty] of merged) {
    const p = bySku.get(sku);
    if (!p || !p.onSale || !p.stripePriceId) return fail("unavailable", 409, { sku, name: p?.name ?? null });
    lines.push({ sku, quantity: Math.min(qty, p.maxPerOrder), price: p.stripePriceId, unitCents: p.priceCents, name: p.name });
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
      line_items: lines.map((l) => ({ price: l.price, quantity: l.quantity })),
      shipping_address_collection: { allowed_countries: SHOP.checkout.allowed_countries as ["US"] },
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
