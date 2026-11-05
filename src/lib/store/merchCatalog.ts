import "server-only";

/**
 * Merch for the shop pages and Platform (service role).
 *
 *   listMerchListings   the shelf: live listings (staff previews also get hidden ones)
 *   getMerchListing     one product page by its link
 *   listAdminListings   Platform ▸ Shop ▸ Merch: every listing with its colors,
 *                       per-size prices and margins, Printful products and warnings
 *   updateListing / reorderListings / moveProduct   staff edits, then the rows resettle
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { COLLECTIONS, ITEM_TYPES, MERCH_CATEGORY, keepCents, orderColors, slugify, type OptionLabel } from "./merch";
import { MerchNotReady, merchNotReady, resettleListing, type ListingRow, type SizeGuide } from "./merchSync";
import { PERSONAL, type PersonalProduct } from "./personal";

export interface MerchVariant {
  sku: string; color: string | null; colorHex: string | null; option: string | null; group: string | null;
  priceCents: number; image: string | null; onSale: boolean;
  /** Made when ordered: what the buyer picks and the ink of its print files. */
  personal: PersonalProduct | null;
}
export interface MerchColor { name: string; hex: string | null; image: string | null }
export interface MerchListing {
  id: string; slug: string; name: string; itemType: string; collection: string; series: string | null; description: string | null; facts: string[];
  photos: { url: string; alt?: string }[]; optionLabel: OptionLabel; sizeGuide: SizeGuide | null;
  deliveryMin: number | null; deliveryMax: number | null; sortOrder: number; live: boolean;
  colors: MerchColor[]; options: string[]; variants: MerchVariant[]; fromCents: number; priceVaries: boolean;
}

type VariantRow = {
  sku: string; listing_id: string; color: string | null; color_hex: string | null; option_value: string | null; option_group: string | null;
  price_cents: number; printful_price_cents: number | null; cost_cents: number | null; image_url: string | null; active: boolean;
  printful_available: boolean; picture_view: string | null; sort_order: number; printful_sync_product_id: number | null;
};
const VARIANT_COLS = "sku, listing_id, color, color_hex, option_value, option_group, price_cents, printful_price_cents, cost_cents, image_url, active, printful_available, picture_view, sort_order, printful_sync_product_id";

function shape(l: ListingRow, rows: VariantRow[], opts: { preview: boolean }): MerchListing | null {
  const hidden = new Set(l.hidden_colors);
  // A staff preview of a hidden listing shows what would sell once it's live.
  const selling = rows.filter((r) => (opts.preview && !l.live ? r.printful_available && !hidden.has(r.color ?? "") : r.active));
  if (!selling.length) return null;
  const colorNames = orderColors(selling.map((r) => ({ color: r.color, order: r.sort_order })));
  const colors = colorNames.map((name) => {
    const r = selling.find((x) => x.color === name)!;
    return { name, hex: r.color_hex, image: r.image_url };
  });
  const options: string[] = [];
  for (const r of [...selling].sort((a, b) => a.sort_order - b.sort_order)) if (r.option_value && !options.includes(r.option_value)) options.push(r.option_value);
  const prices = selling.map((r) => r.price_cents);
  return {
    id: l.id, slug: l.slug, name: l.name, itemType: l.item_type, collection: l.collection, series: l.series ?? null, description: l.description, facts: l.facts ?? [],
    photos: Array.isArray(l.photos) ? l.photos : [], optionLabel: l.option_label, sizeGuide: l.size_guide,
    deliveryMin: l.delivery_min, deliveryMax: l.delivery_max, sortOrder: l.sort_order, live: l.live,
    colors, options,
    variants: selling.sort((a, b) => a.sort_order - b.sort_order).map((r) => ({
      sku: r.sku, color: r.color, colorHex: r.color_hex, option: r.option_value, group: r.option_group,
      priceCents: r.price_cents, image: r.image_url, onSale: r.active,
      personal: r.printful_sync_product_id ? PERSONAL.products[String(r.printful_sync_product_id)] ?? null : null,
    })),
    fromCents: Math.min(...prices),
    priceVaries: new Set(prices).size > 1,
  };
}

async function read(filter: { slug?: string; preview: boolean }): Promise<MerchListing[]> {
  const svc = createServiceClient();
  let q = svc.from("shop_listings").select("*").is("archived_at", null).order("sort_order");
  if (!filter.preview) q = q.eq("live", true);
  if (filter.slug) q = q.eq("slug", filter.slug);
  const { data: listings, error } = await q;
  if (merchNotReady(error)) throw new MerchNotReady();
  if (error) throw new Error(`merch listings: ${error.message}`);
  const ids = (listings ?? []).map((l) => l.id as string);
  if (!ids.length) return [];
  const { data: rows, error: rowErr } = await svc.from("shop_products").select(VARIANT_COLS).in("listing_id", ids).eq("category", MERCH_CATEGORY);
  if (rowErr) throw new Error(`merch rows: ${rowErr.message}`);
  const byListing = new Map<string, VariantRow[]>();
  for (const r of (rows ?? []) as VariantRow[]) byListing.set(r.listing_id, [...(byListing.get(r.listing_id) ?? []), r]);
  const collectionOrder = COLLECTIONS.map((c) => c.id as string);
  return ((listings ?? []) as ListingRow[])
    .map((l) => shape(l, byListing.get(l.id) ?? [], { preview: filter.preview }))
    .filter((x): x is MerchListing => !!x)
    .sort((a, b) => (collectionOrder.indexOf(a.collection) - collectionOrder.indexOf(b.collection)) || a.sortOrder - b.sortOrder);
}

/** The shelf. `preview` (staff) adds listings that aren't live yet. */
export const listMerchListings = (opts: { preview?: boolean } = {}) => read({ preview: !!opts.preview });

export async function getMerchListing(slug: string, opts: { preview?: boolean } = {}): Promise<MerchListing | null> {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return null;
  return (await read({ slug, preview: !!opts.preview }))[0] ?? null;
}

// ─── Platform ───────────────────────────────────────────────────────────────

export interface AdminListing {
  id: string; slug: string; name: string; itemType: string; collection: string; series: string | null; description: string | null; facts: string[];
  photos: { url: string; alt?: string }[]; hiddenColors: string[]; live: boolean; archived: boolean; sortOrder: number; optionLabel: OptionLabel;
  shipCostCents: number | null; deliveryMin: number | null; deliveryMax: number | null;
  colors: { name: string; hex: string | null; image: string | null; hidden: boolean; back: boolean; available: boolean }[];
  sizes: { option: string; priceCents: number; costCents: number | null; keepCents: number | null; printfulPrices: number[] }[];
  printful: { id: number; name: string; variants: number; removed: boolean }[];
  selling: number; total: number;
  warnings: string[];
}

export async function listAdminListings(): Promise<{ listings: AdminListing[]; unassigned: { id: number; name: string }[]; lastSync: string | null }> {
  const svc = createServiceClient();
  const [{ data: listings, error }, { data: rows }, { data: products }] = await Promise.all([
    svc.from("shop_listings").select("*").order("sort_order"),
    svc.from("shop_products").select(VARIANT_COLS).eq("category", MERCH_CATEGORY),
    svc.from("shop_printful_products").select("sync_product_id, listing_id, name, variants, synced_at, removed_at"),
  ]);
  if (merchNotReady(error)) throw new MerchNotReady();
  if (error) throw new Error(`merch admin: ${error.message}`);
  const all = (rows ?? []) as VariantRow[];
  const prods = (products ?? []) as { sync_product_id: number; listing_id: string | null; name: string; variants: number; synced_at: string; removed_at: string | null }[];
  const out = ((listings ?? []) as ListingRow[]).map((l): AdminListing => {
    const own = all.filter((r) => r.listing_id === l.id).sort((a, b) => a.sort_order - b.sort_order);
    const hidden = new Set(l.hidden_colors);
    const colors = orderColors(own.map((r) => ({ color: r.color, order: r.sort_order }))).map((name) => {
      const rs = own.filter((r) => r.color === name);
      return { name, hex: rs[0].color_hex, image: rs[0].image_url, hidden: hidden.has(name), back: rs.some((r) => r.picture_view === "back"), available: rs.some((r) => r.printful_available) };
    });
    const options: string[] = [];
    for (const r of own) if (!options.includes(r.option_value ?? "")) options.push(r.option_value ?? "");
    const sizes = options.map((option) => {
      const rs = own.filter((r) => (r.option_value ?? "") === option && r.printful_available);
      const price = rs.length ? Math.max(...rs.map((r) => r.price_cents)) : 0;
      const cost = rs.length ? Math.max(...rs.map((r) => r.cost_cents ?? 0)) : null;
      return {
        option, priceCents: price, costCents: cost,
        keepCents: cost != null && l.ship_cost_cents != null ? keepCents(price, cost, l.ship_cost_cents) : null,
        printfulPrices: [...new Set(rs.map((r) => r.printful_price_cents ?? 0))].sort((a, b) => a - b),
      };
    });
    const warnings: string[] = [];
    for (const c of colors) if (c.back && !c.hidden) warnings.push(`The ${c.name} picture in Printful is the back view. Pick the front mockup in Printful, then sync.`);
    for (const s of sizes) if (s.printfulPrices.length > 1) warnings.push(`${s.option || "Every size"}: Printful has ${s.printfulPrices.map((p) => `$${(p / 100).toFixed(2)}`).join(" and ")}. The shop charges the highest; make them match in Printful.`);
    for (const s of sizes) if (s.keepCents != null && s.keepCents < 500) warnings.push(`${s.option || "This product"} keeps $${(s.keepCents / 100).toFixed(2)} an order.`);
    return {
      id: l.id, slug: l.slug, name: l.name, itemType: l.item_type, collection: l.collection, series: l.series ?? null, description: l.description, facts: l.facts ?? [],
      photos: Array.isArray(l.photos) ? l.photos : [], hiddenColors: l.hidden_colors, live: l.live, archived: !!l.archived_at, sortOrder: l.sort_order, optionLabel: l.option_label,
      shipCostCents: l.ship_cost_cents, deliveryMin: l.delivery_min, deliveryMax: l.delivery_max,
      colors, sizes,
      printful: prods.filter((p) => p.listing_id === l.id).map((p) => ({ id: Number(p.sync_product_id), name: p.name, variants: p.variants, removed: !!p.removed_at })),
      selling: own.filter((r) => r.active).length, total: own.length,
      warnings,
    };
  });
  const lastSync = prods.reduce<string | null>((m, p) => (!m || p.synced_at > m ? p.synced_at : m), null);
  return { listings: out, unassigned: prods.filter((p) => !p.listing_id && !p.removed_at).map((p) => ({ id: Number(p.sync_product_id), name: p.name })), lastSync };
}

export class MerchEditError extends Error {
  constructor(public code: string) { super(code); this.name = "MerchEditError"; }
}

export interface ListingPatch {
  name?: string; slug?: string; collection?: string; series?: string | null; itemType?: string; description?: string | null; facts?: string[];
  hiddenColors?: string[]; live?: boolean; archived?: boolean; photos?: { url: string; alt?: string }[];
}

/** Photos must be ours: uploaded to our storage, or a file in /images. */
function ourPhoto(url: string): boolean {
  const base = (process.env.R2_PUBLIC_BASE_URL ?? process.env.R2_PUBLIC_BASE ?? "https://gs-ugc.empac.co").replace(/\/$/, "");
  return url.startsWith(`${base}/shop/merch/`) || /^\/images\/[\w./-]+$/.test(url);
}

export async function updateListing(id: string, patch: ListingPatch): Promise<void> {
  const cols: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) {
    const n = patch.name.replace(/\s+/g, " ").trim();
    if (n.length < 1 || n.length > 60) throw new MerchEditError("bad_name");
    cols.name = n;
  }
  if (patch.slug !== undefined) {
    const s = slugify(patch.slug);
    if (!/^[a-z0-9-]{2,60}$/.test(s)) throw new MerchEditError("bad_slug");
    cols.slug = s;
  }
  if (patch.collection !== undefined) {
    if (!COLLECTIONS.some((c) => c.id === patch.collection)) throw new MerchEditError("bad_collection");
    cols.collection = patch.collection;
  }
  if (patch.series !== undefined) {
    const v = (patch.series ?? "").replace(/\s+/g, " ").trim();
    if (v.length > 40) throw new MerchEditError("bad_series");
    cols.series = v || null;
  }
  if (patch.itemType !== undefined) {
    if (!(ITEM_TYPES as readonly string[]).includes(patch.itemType)) throw new MerchEditError("bad_type");
    cols.item_type = patch.itemType;
  }
  if (patch.description !== undefined) {
    const d = (patch.description ?? "").trim();
    if (d.length > 1000) throw new MerchEditError("bad_description");
    cols.description = d || null;
  }
  if (patch.facts !== undefined) cols.facts = patch.facts.map((f) => f.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 8).map((f) => f.slice(0, 140));
  if (patch.hiddenColors !== undefined) cols.hidden_colors = [...new Set(patch.hiddenColors.map((c) => c.trim()).filter(Boolean))].slice(0, 60);
  if (patch.live !== undefined) cols.live = !!patch.live;
  if (patch.archived !== undefined) cols.archived_at = patch.archived ? new Date().toISOString() : null;
  if (patch.photos !== undefined) {
    if (patch.photos.length > 8 || patch.photos.some((p) => !ourPhoto(p.url))) throw new MerchEditError("bad_photo");
    cols.photos = patch.photos.map((p) => ({ url: p.url, alt: (p.alt ?? "").slice(0, 140) }));
  }
  const { error } = await createServiceClient().from("shop_listings").update(cols).eq("id", id);
  if (error?.code === "23505") throw new MerchEditError("slug_taken");
  if (error) throw new Error(`merch update: ${error.message}`);
  if ("name" in cols || "live" in cols || "hidden_colors" in cols || "archived_at" in cols) await resettleListing(id);
}

export async function reorderListings(ids: string[]): Promise<void> {
  const svc = createServiceClient();
  for (const [i, id] of ids.entries()) await svc.from("shop_listings").update({ sort_order: (i + 1) * 10 }).eq("id", id);
}

/** Move a Printful product (and its sizes and colors) into another listing. */
export async function moveProduct(syncProductId: number, listingId: string): Promise<void> {
  const svc = createServiceClient();
  const { data: before } = await svc.from("shop_printful_products").select("listing_id").eq("sync_product_id", syncProductId).maybeSingle();
  if (!before) throw new MerchEditError("not_found");
  const { data: target } = await svc.from("shop_listings").select("id").eq("id", listingId).maybeSingle();
  if (!target) throw new MerchEditError("not_found");
  await svc.from("shop_printful_products").update({ listing_id: listingId }).eq("sync_product_id", syncProductId);
  await svc.from("shop_products").update({ listing_id: listingId }).eq("printful_sync_product_id", syncProductId);
  await resettleListing(listingId);
  if (before.listing_id && before.listing_id !== listingId) await resettleListing(before.listing_id as string);
}

// ─── development only: the shop straight from Printful, before merch-m1.sql ──

/**
 * On the dev server only: build the shelf from a Printful dry run (every
 * product, as if live), so the pages can be checked before the migration
 * runs. Products' rows aren't in the database, so Checkout refuses them.
 */
type DevPreview = { listings: MerchListing[]; products: import("./products").ShopProduct[] };
let devCache: { at: number; value: Promise<DevPreview> } | null = null;

export async function devPreviewFromPrintful(): Promise<DevPreview | null> {
  if (process.env.NODE_ENV !== "development") return null;
  // A dry run reads the whole Printful store (Printful allows about 120 calls a minute), so keep it five minutes.
  if (devCache && Date.now() - devCache.at < 300_000) return devCache.value;
  const value = buildDevPreview();
  devCache = { at: Date.now(), value };
  value.catch(() => { devCache = null; });
  return value;
}

async function buildDevPreview(): Promise<DevPreview> {
  const { planSync } = await import("./merchSync");
  const plan = await planSync({ dryRun: true });
  const listings: MerchListing[] = [];
  for (const l of plan.listings) {
    const rows = plan.rows.filter((r) => r.listing_key === l.group_key).map((r) => ({
      sku: r.sku, listing_id: l.group_key, color: r.color, color_hex: r.color_hex, option_value: r.option_value, option_group: r.option_group,
      price_cents: r.price_cents, printful_price_cents: r.printful_price_cents, cost_cents: r.cost_cents, image_url: r.image_url,
      active: r.printful_available && !l.hidden_colors.includes(r.color ?? ""), printful_available: r.printful_available, picture_view: r.picture_view,
      sort_order: r.sort_order, printful_sync_product_id: r.printful_sync_product_id,
    }));
    const shaped = shape({ ...l, id: l.group_key, live: true } as ListingRow, rows, { preview: false });
    if (shaped) listings.push(shaped);
  }
  const collectionOrder = COLLECTIONS.map((c) => c.id as string);
  listings.sort((a, b) => (collectionOrder.indexOf(a.collection) - collectionOrder.indexOf(b.collection)) || a.sortOrder - b.sortOrder);
  const products = plan.rows.map((r) => ({
    sku: r.sku, kind: "single" as const, category: MERCH_CATEGORY, name: r.name, blurb: null, description: null, contents: [],
    priceCents: r.price_cents, stripePriceId: null, onSale: r.printful_available, stock: r.stock_available, held: 0, available: r.stock_available,
    maxPerOrder: r.max_per_order, shipWeightOz: 1, imageUrl: r.image_url, sortOrder: r.sort_order, listingId: r.listing_key, color: r.color, optionValue: r.option_value,
    personal: PERSONAL.products[String(r.printful_sync_product_id)] ?? null,
  }));
  return { listings, products };
}
