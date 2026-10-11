import "server-only";

/**
 * The shop catalog, managed from Platform ▸ Shop orders ▸ Products. Each
 * change goes to Stripe and the table together:
 *   - name, description, kind, category -> the Stripe Product (fixed id
 *     gs_shop_<sku>, tax code txcd_99999999, metadata gs_kind "shop")
 *   - price -> a new Stripe Price (tax exclusive, lookup key shop_<sku>), the
 *     old one archived; orders keep the price they were paid at
 *   - stock, on/off, limits, weight, photo, contents -> the table only
 *   - archive -> the Stripe Product archived and the product off the shelf for
 *     good (kept for order history); restore brings it back switched off
 * scripts/seed-shop.ts uses the same Stripe helpers for the first import.
 * While the Stripe key is live, writes need the shop_live_catalog platform
 * flag (live mode is a deliberate switch).
 */

import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { createServiceClient } from "@/lib/supabase/admin";
import { getPlatformFlag } from "@/lib/platform/flags";
import { SHOP, SHOP_METADATA_KIND, SHOP_TAX_CODE, isOnSale, stripeLookupKey, stripeProductId, type ProductKind } from "./config";

export class CatalogError extends Error {
  constructor(public code: string) { super(code); this.name = "CatalogError"; }
}

// ─── Stripe (shared with the seed script) ───────────────────────────────────

function sameMetadata(a: Stripe.Metadata | null | undefined, b: Record<string, string>): boolean {
  const ka = Object.keys(a ?? {}).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && kb.every((k, i) => ka[i] === k && (a ?? {})[k] === b[k]);
}

export interface StripeProductInput { sku: string; kind: ProductKind; category: string; name: string; description: string | null; active?: boolean }

/** Create or update the Stripe Product for a SKU. */
export async function syncStripeProduct(p: StripeProductInput, opts: { dryRun?: boolean } = {}): Promise<{ id: string; change: "created" | "updated" | "unchanged" }> {
  const stripe = getStripe();
  const id = stripeProductId(p.sku);
  const metadata = { sku: p.sku, kind: p.kind, category: p.category, gs_kind: SHOP_METADATA_KIND };
  const want = { name: p.name, description: p.description || p.name, tax_code: SHOP_TAX_CODE, metadata, active: p.active ?? true };
  let existing: Stripe.Product | null = null;
  try {
    existing = await stripe.products.retrieve(id);
  } catch (err) {
    if ((err as { code?: string }).code !== "resource_missing") throw err;
  }
  if (!existing) {
    if (!opts.dryRun) await stripe.products.create({ id, ...want });
    return { id, change: "created" };
  }
  const taxCode = typeof existing.tax_code === "string" ? existing.tax_code : existing.tax_code?.id ?? null;
  const differs = existing.name !== want.name || existing.description !== want.description || taxCode !== want.tax_code || existing.active !== want.active || !sameMetadata(existing.metadata, metadata);
  if (!differs) return { id, change: "unchanged" };
  if (!opts.dryRun) await stripe.products.update(id, want);
  return { id, change: "updated" };
}

/** Make sure the SKU's active Price is this amount (a change makes a new Price and archives the old). */
export async function syncStripePrice(sku: string, priceCents: number, productId: string, opts: { dryRun?: boolean } = {}): Promise<{ id: string; change: "created" | "updated" | "unchanged"; previous: number | null }> {
  const stripe = getStripe();
  const lookupKey = stripeLookupKey(sku);
  const current = (await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })).data[0] ?? null;
  const currentProduct = current ? (typeof current.product === "string" ? current.product : current.product.id) : null;
  if (current && current.unit_amount === priceCents && current.currency === SHOP.currency && current.tax_behavior === "exclusive" && currentProduct === productId && current.type === "one_time") {
    return { id: current.id, change: "unchanged", previous: current.unit_amount };
  }
  if (opts.dryRun) return { id: current?.id ?? "(dry run)", change: current ? "updated" : "created", previous: current?.unit_amount ?? null };
  const created = await stripe.prices.create({
    product: productId, unit_amount: priceCents, currency: SHOP.currency, tax_behavior: "exclusive",
    lookup_key: lookupKey, transfer_lookup_key: true, metadata: { sku, gs_kind: SHOP_METADATA_KIND },
  });
  // The new price becomes the default first: Stripe won't archive a product's default price.
  await stripe.products.update(productId, { default_price: created.id });
  if (current) await stripe.prices.update(current.id, { active: false });
  return { id: created.id, change: current ? "updated" : "created", previous: current?.unit_amount ?? null };
}

async function assertWritable() {
  const live = (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_");
  if (live && !(await getPlatformFlag("shop_live_catalog", false))) throw new CatalogError("live_locked");
}

// ─── admin reads ────────────────────────────────────────────────────────────

export interface AdminProduct {
  sku: string; kind: ProductKind; category: string; name: string; blurb: string | null; description: string | null; contents: string[];
  priceCents: number; stripePriceId: string | null; active: boolean; onSale: boolean; archived: boolean; inactiveAfter: string | null;
  stock: number; held: number; available: number; sold: number; maxPerOrder: number; shipWeightOz: number; imageUrl: string | null; sortOrder: number;
}

export async function listAdminProducts(): Promise<AdminProduct[]> {
  const svc = createServiceClient();
  const [{ data: rows, error }, { data: avail }, { data: sold }] = await Promise.all([
    svc.from("shop_products").select("*").order("sort_order"),
    svc.rpc("shop_availability"),
    svc.from("shop_order_items").select("sku, quantity, shop_orders!inner(status)").in("shop_orders.status", ["paid", "shipped"]),
  ]);
  if (error) throw new Error(`shop products: ${error.message}`);
  const held = new Map(((avail ?? []) as { sku: string; held: number; available: number }[]).map((a) => [a.sku, a]));
  const soldBy = new Map<string, number>();
  for (const s of (sold ?? []) as { sku: string; quantity: number }[]) soldBy.set(s.sku, (soldBy.get(s.sku) ?? 0) + s.quantity);
  return ((rows ?? []) as Record<string, unknown>[]).map((r) => {
    const sku = r.sku as string;
    const a = held.get(sku);
    return {
      sku, kind: r.kind as ProductKind, category: r.category as string, name: r.name as string, blurb: (r.blurb as string) ?? null, description: (r.description as string) ?? null,
      contents: (r.contents as string[]) ?? [], priceCents: r.price_cents as number, stripePriceId: (r.stripe_price_id as string) ?? null,
      active: !!r.active, onSale: !r.archived_at && isOnSale({ active: !!r.active, inactive_after: (r.inactive_after as string) ?? null }), archived: !!r.archived_at,
      inactiveAfter: (r.inactive_after as string) ?? null, stock: r.stock_available as number, held: a?.held ?? 0, available: a?.available ?? (r.stock_available as number),
      sold: soldBy.get(sku) ?? 0, maxPerOrder: r.max_per_order as number, shipWeightOz: Number(r.ship_weight_oz), imageUrl: (r.image_url as string) ?? null, sortOrder: r.sort_order as number,
    };
  });
}

// ─── admin writes ───────────────────────────────────────────────────────────

export interface ProductInput {
  sku?: string; kind?: ProductKind; category?: string; name?: string; blurb?: string | null; description?: string | null; contents?: string[];
  priceCents?: number; maxPerOrder?: number; shipWeightOz?: number; stockAvailable?: number; active?: boolean; imageUrl?: string | null; sortOrder?: number;
  inactiveAfter?: string | null;
}

/** Validate an admin form into table columns. Throws CatalogError with the field that's wrong. */
function columnsFrom(input: ProductInput, creating: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : null);
  if (creating) {
    if (!input.sku || !/^[a-z0-9-]{2,40}$/.test(input.sku)) throw new CatalogError("bad_sku");
  }
  if (input.kind !== undefined) { if (input.kind !== "bundle" && input.kind !== "single") throw new CatalogError("bad_kind"); out.kind = input.kind; }
  if (input.category !== undefined) { const c = text(input.category, 30); if (!c) throw new CatalogError("bad_category"); out.category = c; }
  if (input.name !== undefined) { const n = text(input.name, 80); if (!n) throw new CatalogError("bad_name"); out.name = n; }
  if (input.blurb !== undefined) out.blurb = text(input.blurb, 200) || null;
  if (input.description !== undefined) out.description = text(input.description, 1000) || null;
  if (input.contents !== undefined) out.contents = (Array.isArray(input.contents) ? input.contents : []).map((c) => String(c).trim().slice(0, 200)).filter(Boolean).slice(0, 20);
  if (input.priceCents !== undefined) { if (!Number.isInteger(input.priceCents) || input.priceCents < 50 || input.priceCents > 100_000) throw new CatalogError("bad_price"); out.price_cents = input.priceCents; }
  if (input.maxPerOrder !== undefined) { if (!Number.isInteger(input.maxPerOrder) || input.maxPerOrder < 1 || input.maxPerOrder > 20) throw new CatalogError("bad_max"); out.max_per_order = input.maxPerOrder; }
  if (input.shipWeightOz !== undefined) { if (!(input.shipWeightOz > 0 && input.shipWeightOz < 200)) throw new CatalogError("bad_weight"); out.ship_weight_oz = Math.round(input.shipWeightOz * 100) / 100; }
  if (input.stockAvailable !== undefined) { if (!Number.isInteger(input.stockAvailable) || input.stockAvailable < 0 || input.stockAvailable > 100_000) throw new CatalogError("bad_stock"); out.stock_available = input.stockAvailable; }
  if (input.active !== undefined) out.active = !!input.active;
  if (input.sortOrder !== undefined) { if (!Number.isInteger(input.sortOrder)) throw new CatalogError("bad_sort"); out.sort_order = input.sortOrder; }
  if (input.imageUrl !== undefined) {
    const u = text(input.imageUrl, 400);
    if (u && !/^(https:\/\/|\/images\/)/.test(u)) throw new CatalogError("bad_image");
    out.image_url = u || null;
  }
  if (input.inactiveAfter !== undefined) {
    if (input.inactiveAfter && Number.isNaN(Date.parse(input.inactiveAfter))) throw new CatalogError("bad_date");
    out.inactive_after = input.inactiveAfter || null;
  }
  return out;
}

async function logChange(sku: string, action: string, detail: Record<string, unknown>, actor: string | null) {
  await createServiceClient().from("shop_product_changes").insert({ sku, action, detail, actor_user_id: actor });
}

export async function createProduct(input: ProductInput, actor: string | null): Promise<AdminProduct> {
  await assertWritable();
  const cols = columnsFrom({ kind: "bundle", category: "tcg", maxPerOrder: 5, shipWeightOz: 4, stockAvailable: 0, active: false, sortOrder: 100, ...input }, true);
  if (cols.name === undefined || cols.price_cents === undefined) throw new CatalogError("missing_fields");
  const sku = input.sku!;
  const svc = createServiceClient();
  const { data: clash } = await svc.from("shop_products").select("sku").eq("sku", sku).maybeSingle();
  if (clash) throw new CatalogError("sku_taken");
  const product = await syncStripeProduct({ sku, kind: cols.kind as ProductKind, category: cols.category as string, name: cols.name as string, description: (cols.description as string) ?? (cols.blurb as string) ?? null });
  const price = await syncStripePrice(sku, cols.price_cents as number, product.id);
  const { error } = await svc.from("shop_products").insert({ sku, ...cols, stripe_product_id: product.id, stripe_price_id: price.id });
  if (error) throw new Error(`create ${sku}: ${error.message}`);
  await logChange(sku, "create", { price_cents: cols.price_cents, name: cols.name }, actor);
  return (await listAdminProducts()).find((p) => p.sku === sku)!;
}

export async function updateProduct(sku: string, input: ProductInput, actor: string | null): Promise<AdminProduct> {
  await assertWritable();
  const svc = createServiceClient();
  const { data: cur } = await svc.from("shop_products").select("*").eq("sku", sku).maybeSingle();
  if (!cur) throw new CatalogError("not_found");
  const cols = columnsFrom(input, false);
  const changed = Object.keys(cols).filter((k) => JSON.stringify(cols[k] ?? null) !== JSON.stringify((cur as Record<string, unknown>)[k] ?? null) && !(k === "ship_weight_oz" && Number(cols[k]) === Number(cur.ship_weight_oz)));
  if (changed.length === 0) return (await listAdminProducts()).find((p) => p.sku === sku)!;
  const patch: Record<string, unknown> = Object.fromEntries(changed.map((k) => [k, cols[k]]));
  const merged = { ...cur, ...patch } as Record<string, unknown>;
  if (["name", "description", "blurb", "kind", "category"].some((k) => changed.includes(k))) {
    await syncStripeProduct({ sku, kind: merged.kind as ProductKind, category: merged.category as string, name: merged.name as string, description: (merged.description as string) ?? (merged.blurb as string) ?? null, active: !cur.archived_at });
  }
  if (changed.includes("price_cents")) {
    const price = await syncStripePrice(sku, merged.price_cents as number, (cur.stripe_product_id as string) ?? stripeProductId(sku));
    patch.stripe_price_id = price.id;
  }
  const { error } = await svc.from("shop_products").update({ ...patch, updated_at: new Date().toISOString() }).eq("sku", sku);
  if (error) throw new Error(`update ${sku}: ${error.message}`);
  await logChange(sku, "update", Object.fromEntries(changed.map((k) => [k, { from: (cur as Record<string, unknown>)[k] ?? null, to: cols[k] ?? null }])), actor);
  return (await listAdminProducts()).find((p) => p.sku === sku)!;
}

/** Take a product off the shelf for good (kept for order history), or bring it back switched off. */
export async function setArchived(sku: string, archived: boolean, actor: string | null): Promise<AdminProduct> {
  await assertWritable();
  const svc = createServiceClient();
  const { data: cur } = await svc.from("shop_products").select("*").eq("sku", sku).maybeSingle();
  if (!cur) throw new CatalogError("not_found");
  await syncStripeProduct({ sku, kind: cur.kind as ProductKind, category: cur.category as string, name: cur.name as string, description: (cur.description as string) ?? (cur.blurb as string) ?? null, active: !archived });
  const { error } = await svc.from("shop_products").update({ archived_at: archived ? new Date().toISOString() : null, active: false, updated_at: new Date().toISOString() }).eq("sku", sku);
  if (error) throw new Error(`archive ${sku}: ${error.message}`);
  await logChange(sku, archived ? "archive" : "restore", {}, actor);
  return (await listAdminProducts()).find((p) => p.sku === sku)!;
}
