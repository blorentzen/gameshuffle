import "server-only";

/**
 * Printful → the shop (service role). Pulls every product in the Printful
 * store, groups them into shop products (shop_listings, by design and item:
 * groupKeyFor), and writes one shop_products row per size and color.
 *
 * A Printful product keeps the listing it was first put in (staff can move it
 * in Platform), so renaming a product in Printful never splits a listing. New
 * listings start hidden (`live` off) with a name, link, item type, details,
 * size guide and, for tees, the look-alike colors hidden (pick 9). Prices come
 * from Printful (pick 7), one per size across a listing's colors: the highest
 * (pick 8). Sizes and colors Printful retires or ignores stop selling on the
 * next sync; their rows stay so old orders keep their names.
 *
 * Runs from Platform ▸ Shop ▸ Merch (Sync from Printful) and from Printful's
 * product webhooks. `dryRun` returns the plan without writing.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { readAllPages } from "@/lib/supabase/pages";
import {
  CURATED_FACTS, DEFAULT_HIDDEN_COLORS, MERCH_CATEGORY, MERCH_MAX_PER_ORDER, MERCH_STOCK,
  collectionFor, deliveryDays, factsFromDescription, groupKeyFor, itemFor, itemRank, listingNameFor, merchSku, seriesCollection, seriesOf,
  phoneGroup, pictureView, priceForOption, sizeRank, slugify, type OptionLabel,
} from "./merch";
import {
  getCatalogProduct, getSizeTables, getSyncProduct, listSyncProducts, standardShipping,
  type PfCatalogProduct, type PfSyncProduct, type PfSyncVariant,
} from "./printful";

export class MerchNotReady extends Error {
  constructor() { super("Merch needs supabase/merch-m1.sql"); this.name = "MerchNotReady"; }
}
export const merchNotReady = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "42703" || e.code === "PGRST204" || /shop_listings|listing_id|printful_/.test(e.message ?? "") && /does not exist|schema cache/.test(e.message ?? ""));

export interface SizeGuide { unit: string; columns: string[]; rows: { size: string; values: string[] }[] }

export interface ListingRow {
  id: string; group_key: string; slug: string; name: string; item_type: string; collection: string; description: string | null;
  facts: string[]; hidden_colors: string[]; photos: { url: string; alt?: string }[]; option_label: OptionLabel; size_guide: SizeGuide | null;
  ship_cost_cents: number | null; delivery_min: number | null; delivery_max: number | null; sort_order: number; live: boolean; archived_at: string | null;
  series?: string | null; // missing on databases from before the column
}

export interface VariantRowInput {
  sku: string; listing_id: string; printful_sync_variant_id: number; printful_sync_product_id: number; printful_variant_id: number;
  name: string; color: string | null; color_hex: string | null; option_value: string | null; option_group: string | null;
  cost_cents: number | null; printful_price_cents: number; price_cents: number; image_url: string | null; picture_view: string | null;
  printful_available: boolean; active: boolean; sort_order: number;
  kind: "single"; category: string; stock_available: number; max_per_order: number; ship_weight_oz: number; contents: string[];
}

export interface SyncSummary {
  printfulProducts: number;
  listingsCreated: string[];
  listingsTotal: number;
  variants: number;
  retired: number;
  warnings: string[];
  /** Listings still without Printful shipping or a size guide because the sync ran out of time; the next sync fills them. */
  unfinished?: number;
}

const cents = (s: string | number | null | undefined) => Math.round(Number(s ?? 0) * 100);
const isOneSize = (v: string | null) => !v || /^one size$/i.test(v);

/** A variant's option: the phone model, or the size ("One size" counts as none). */
function optionOf(v: PfSyncVariant, label: OptionLabel): string | null {
  if (label === "Phone") return v.size ?? null;
  return isOneSize(v.size) ? null : v.size;
}

function guideFrom(tables: { type: string; unit: string; measurements: { type_label: string; values: { size: string; value?: string; min_value?: string; max_value?: string }[] }[] }[]): SizeGuide | null {
  const t = tables.find((x) => x.type === "product_measure") ?? tables[0];
  if (!t || !t.measurements.length) return null;
  const sizes = [...new Set(t.measurements.flatMap((m) => m.values.map((v) => v.size)))];
  if (sizes.length < 2) return null;
  return {
    unit: t.unit,
    columns: t.measurements.map((m) => m.type_label),
    rows: sizes.map((size) => ({ size, values: t.measurements.map((m) => {
      const v = m.values.find((x) => x.size === size);
      return v ? (v.value ?? (v.min_value && v.max_value ? `${v.min_value} to ${v.max_value}` : "")) : "";
    }) })),
  };
}

/** Name for a size and color row: "Monogram Tee · Black · L", leaving out a listing's only color and "One size". */
export function variantName(listingName: string, color: string | null, option: string | null, oneColor: boolean): string {
  return [listingName, oneColor ? null : color, option].filter(Boolean).join(" · ").slice(0, 80);
}

/**
 * The selling state of a listing's rows: prices per size (the highest), names
 * and whether each row sells (listing live, Printful has it, color shown).
 */
export function settleRows<T extends Pick<VariantRowInput, "color" | "option_value" | "printful_price_cents" | "printful_available" | "price_cents" | "active" | "name">>(listing: Pick<ListingRow, "name" | "live" | "hidden_colors" | "archived_at">, rows: T[]): T[] {
  const byOption = new Map<string, number[]>();
  for (const r of rows) {
    const k = r.option_value ?? "";
    byOption.set(k, [...(byOption.get(k) ?? []), r.printful_price_cents]);
  }
  const colors = new Set(rows.map((r) => r.color ?? ""));
  const hidden = new Set(listing.hidden_colors);
  return rows.map((r) => ({
    ...r,
    price_cents: priceForOption(byOption.get(r.option_value ?? "") ?? [r.printful_price_cents]),
    name: variantName(listing.name, r.color, r.option_value, colors.size <= 1),
    active: listing.live && !listing.archived_at && r.printful_available && !hidden.has(r.color ?? ""),
  }));
}

async function inBatches<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

export interface SyncPlan {
  summary: SyncSummary;
  listings: (Omit<ListingRow, "id"> & { id: string | null; printful: { id: number; name: string; catalogId: number }[] })[];
  rows: (Omit<VariantRowInput, "listing_id"> & { listing_key: string })[];
}

/**
 * Read Printful and work out every listing and row, without writing.
 * `dryRun` also works before merch-m1.sql (as if nothing had been synced yet).
 */
export async function planSync(opts: { full?: boolean; dryRun?: boolean; deadline?: number } = {}): Promise<SyncPlan> {
  const svc = createServiceClient();
  const warnings: string[] = [];
  const products = (await listSyncProducts()).filter((p) => !p.is_ignored);
  const details = await inBatches(products, 4, (p) => getSyncProduct(p.id));
  const catalogIds = [...new Set(details.flatMap((d) => d.sync_variants.map((v) => v.product.product_id)))];
  const catalogs = new Map<number, PfCatalogProduct>();
  for (const c of await inBatches(catalogIds, 4, (id) => getCatalogProduct(id))) catalogs.set(c.product.id, c);

  let mapped = new Map<number, string | null>();
  let existing: ListingRow[] = [];
  const [{ data: mapRows, error: mapErr }, { data: listRows, error: listErr }] = await Promise.all([
    svc.from("shop_printful_products").select("sync_product_id, listing_id"),
    svc.from("shop_listings").select("*"),
  ]);
  const missing = merchNotReady(mapErr) || merchNotReady(listErr);
  if (missing && !opts.dryRun) throw new MerchNotReady();
  if (!missing && (mapErr || listErr)) throw new Error(`merch sync read: ${(mapErr ?? listErr)!.message}`);
  if (!missing) {
    mapped = new Map((mapRows ?? []).map((r) => [Number(r.sync_product_id), (r.listing_id as string) ?? null]));
    existing = (listRows ?? []) as ListingRow[];
  }
  const byId = new Map(existing.map((l) => [l.id, l]));
  const byKey = new Map(existing.map((l) => [l.group_key, l]));
  const takenSlugs = new Set(existing.map((l) => l.slug));
  const firstSort = existing.reduce((n, l) => Math.max(n, l.sort_order), 0) + 10;

  type Draft = SyncPlan["listings"][number];
  const drafts = new Map<string, Draft>();
  const catalogOf = new Map<string, number>();
  const rows: SyncPlan["rows"] = [];

  for (const d of details) {
    const p: PfSyncProduct = d.sync_product;
    const first = d.sync_variants[0];
    if (!first) { warnings.push(`${p.name.trim()} has no sizes or colors in Printful.`); continue; }
    const catalog = catalogs.get(first.product.product_id);
    const type = catalog?.product.type ?? null;
    const item = itemFor(p.name, type);
    const mappedId = mapped.get(p.id);
    const known = (mappedId && byId.get(mappedId)) || byKey.get(groupKeyFor(p.name, type)) || null;
    const key = known?.group_key ?? groupKeyFor(p.name, type);

    let draft = drafts.get(key);
    if (!draft) {
      const optionLabel: OptionLabel = item.optionLabel === "Phone" ? "Phone" : d.sync_variants.every((v) => isOneSize(v.size)) ? "" : "Size";
      if (known) {
        draft = { ...known, printful: [] };
      } else {
        const name = listingNameFor(p.name, type);
        let slug = slugify(name), n = 2;
        while (takenSlugs.has(slug)) slug = `${slugify(name).slice(0, 56)}-${n++}`;
        takenSlugs.add(slug);
        const curated = CURATED_FACTS[`catalog:${first.product.product_id}`] ?? CURATED_FACTS[`noun:${slugify(item.noun)}`];
        draft = {
          id: null, group_key: key, slug, name, item_type: item.type, collection: collectionFor(p.name), series: seriesOf(p.name), description: null,
          facts: curated ?? factsFromDescription(catalog?.product.description),
          hidden_colors: [], // new tees: set below, once every Printful product in the listing is read
          photos: [], option_label: optionLabel, size_guide: null, ship_cost_cents: null, delivery_min: null, delivery_max: null,
          sort_order: firstSort, live: false, archived_at: null, printful: [], // placed below, once every new listing is known
        };
      }
      drafts.set(key, draft);
      catalogOf.set(key, first.product.product_id);
    }
    draft.printful.push({ id: p.id, name: p.name.trim(), catalogId: first.product.product_id });

    const base = draft.printful.length * 1000;
    // Sizes smallest first within each color (colors keep Printful's order).
    const colorAt = new Map<string, number>();
    for (const v of d.sync_variants) if (!colorAt.has(v.color ?? "")) colorAt.set(v.color ?? "", colorAt.size);
    const ordered = draft.option_label === "Size"
      ? [...d.sync_variants].sort((a, b) => (colorAt.get(a.color ?? "")! - colorAt.get(b.color ?? "")!) || (sizeRank(a.size) - sizeRank(b.size)))
      : d.sync_variants;
    ordered.forEach((v, i) => {
      const cv = catalog?.variants.find((x) => x.id === v.variant_id);
      const preview = v.files.find((f) => f.type === "preview");
      const option = optionOf(v, draft!.option_label);
      rows.push({
        listing_key: key,
        sku: merchSku(v.id), printful_sync_variant_id: v.id, printful_sync_product_id: p.id, printful_variant_id: v.variant_id,
        name: "", color: v.color ?? null, color_hex: cv?.color_code ?? null, option_value: option,
        option_group: draft!.option_label === "Phone" && option ? phoneGroup(option) : null,
        cost_cents: cv ? cents(cv.price) : null, printful_price_cents: cents(v.retail_price), price_cents: cents(v.retail_price),
        image_url: preview?.preview_url ?? v.product.image ?? null, picture_view: pictureView(preview?.filename),
        printful_available: v.availability_status === "active" && !v.is_ignored && v.synced,
        active: false, sort_order: base + i,
        kind: "single", category: MERCH_CATEGORY, stock_available: MERCH_STOCK, max_per_order: MERCH_MAX_PER_ORDER, ship_weight_oz: 1, contents: [],
      });
      if (v.availability_status !== "active") warnings.push(`${p.name.trim()}: ${[v.color, v.size].filter(Boolean).join(" ")} is ${v.availability_status.replace(/_/g, " ")} in Printful.`);
    });
  }

  // A series sits together: new listings in one take the collection of its existing ones, else the first of their own.
  const seriesHome = new Map<string, string>();
  for (const l of existing) if (l.series && !l.archived_at && !seriesHome.has(l.series)) seriesHome.set(l.series, l.collection);
  const newBySeries = new Map<string, Draft[]>();
  for (const d of drafts.values()) if (!d.id && d.series) newBySeries.set(d.series, [...(newBySeries.get(d.series) ?? []), d]);
  for (const [series, list] of newBySeries) {
    const home = seriesHome.get(series) ?? seriesCollection(list.map((d) => d.collection));
    for (const d of list) d.collection = home;
  }

  // New listings line up by item (Tees, Hoodies…), then the first uploaded to Printful (Printful lists newest first);
  // existing ones keep their place, which staff set on Platform.
  const firstUpload = (d: Draft) => Math.min(...d.printful.map((p) => p.id));
  [...drafts.values()]
    .filter((d) => !d.id)
    .sort((a, b) => itemRank(a.item_type) - itemRank(b.item_type) || firstUpload(a) - firstUpload(b))
    .forEach((d, i) => { d.sort_order = firstSort + i * 10; });

  // Shipping, delivery and the size guide: for new listings, ones missing them, or a full sync. One quote and one size
  // guide per blank (many designs share a blank), and none once `deadline` passes: those listings keep what they had
  // and the next sync fills them (the first production sync, 2026-11-05, ran past Vercel's five minutes doing them all).
  // Look them up first, four at a time (each Printful answer takes about a second; one at a time ran past five minutes).
  const ownOf = (d: Draft) => rows.filter((r) => r.listing_key === d.group_key);
  const needShip = (d: Draft) => opts.full || d.ship_cost_cents == null || d.delivery_max == null;
  const needGuide = (d: Draft) => d.option_label === "Size" && !!catalogOf.get(d.group_key) && (opts.full || !d.size_guide);
  // The quote for a blank comes from an in-stock medium (a size Printful can't make here quotes a far-away facility:
  // 19 to 28 days instead of 5 to 7).
  const quoteRank = (r: { printful_available: boolean; option_value: string | null }) =>
    (r.printful_available ? 0 : 2) + (/^(M|L)$/i.test(r.option_value ?? "") ? 0 : 1);
  const shipWant = new Map<number, { variant: number; rank: number }>();
  const guideWant = new Set<number>();
  for (const d of drafts.values()) {
    const catalogId = catalogOf.get(d.group_key) ?? 0;
    if (needShip(d)) for (const r of ownOf(d)) {
      const rank = quoteRank(r);
      if (!shipWant.has(catalogId) || rank < shipWant.get(catalogId)!.rank) shipWant.set(catalogId, { variant: r.printful_variant_id, rank });
    }
    if (needGuide(d)) guideWant.add(catalogOf.get(d.group_key)!);
  }
  const late = () => !!opts.deadline && Date.now() > opts.deadline;
  const shipFor = new Map<number, { cents: number; name: string } | null>();
  const guideFor = new Map<number, ReturnType<typeof guideFrom>>();
  await inBatches([...shipWant], 4, async ([catalogId, { variant }]) => {
    if (!late()) shipFor.set(catalogId, await standardShipping(variant).catch(() => null));
  });
  await inBatches([...guideWant], 4, async (catalogId) => {
    if (!late()) guideFor.set(catalogId, guideFrom(await getSizeTables(catalogId).catch(() => [])));
  });

  let unfinished = 0;
  for (const draft of drafts.values()) {
    const own = ownOf(draft);
    if (!draft.id && draft.item_type === "Tees") {
      const colors = new Set(own.map((r) => r.color ?? ""));
      draft.hidden_colors = DEFAULT_HIDDEN_COLORS.filter((c) => colors.has(c));
    }
    const catalogId = catalogOf.get(draft.group_key) ?? 0;
    let skipped = false;
    if (needShip(draft)) {
      if (!shipFor.has(catalogId)) skipped = true;
      const ship = shipFor.get(catalogId);
      if (ship) {
        draft.ship_cost_cents = ship.cents;
        const days = deliveryDays(ship.name, new Date());
        if (days) { draft.delivery_min = days.min; draft.delivery_max = days.max; }
      }
    }
    if (needGuide(draft)) {
      if (guideFor.has(catalogId)) draft.size_guide = guideFor.get(catalogId)!;
      else skipped = true;
    }
    if (skipped) unfinished++;
    // Pick 8: flag sizes priced differently across colors (the shop charges the highest).
    const byOption = new Map<string, Set<number>>();
    for (const r of own) byOption.set(r.option_value ?? "", new Set([...(byOption.get(r.option_value ?? "") ?? []), r.printful_price_cents]));
    for (const [opt, prices] of byOption) if (prices.size > 1) warnings.push(`${draft.name}${opt ? ` ${opt}` : ""}: Printful has ${[...prices].sort((a, b) => a - b).map((c) => `$${(c / 100).toFixed(2)}`).join(" and ")}; the shop charges the highest.`);
    for (const r of own) if (r.picture_view === "back") warnings.push(`${draft.name}: the ${r.color} picture in Printful is the back view.`);
  }

  // Settle names, prices and selling state per listing.
  const settled: SyncPlan["rows"] = [];
  for (const draft of drafts.values()) settled.push(...settleRows(draft, rows.filter((r) => r.listing_key === draft.group_key)));
  const uniqueWarnings = [...new Set(warnings)];

  return {
    summary: {
      printfulProducts: products.length,
      listingsCreated: [...drafts.values()].filter((d) => !d.id).map((d) => d.name),
      listingsTotal: new Set([...existing.map((l) => l.group_key), ...drafts.keys()]).size,
      variants: settled.length,
      retired: 0,
      warnings: uniqueWarnings,
      unfinished,
    },
    listings: [...drafts.values()],
    rows: settled,
  };
}

/** Write the plan: listings, the Printful product map, every row, and retire what Printful no longer has. */
export async function syncFromPrintful(opts: { full?: boolean; deadline?: number } = {}): Promise<SyncSummary> {
  const plan = await planSync(opts);
  const svc = createServiceClient();
  const now = new Date().toISOString();
  const idByKey = new Map<string, string>();

  for (const l of plan.listings) {
    const { printful, id, ...cols } = l;
    void printful;
    if (id) {
      const { error } = await svc.from("shop_listings").update({
        size_guide: cols.size_guide, ship_cost_cents: cols.ship_cost_cents, delivery_min: cols.delivery_min, delivery_max: cols.delivery_max, option_label: cols.option_label, updated_at: now,
      }).eq("id", id);
      if (error) throw new Error(`merch listing update: ${error.message}`);
      idByKey.set(l.group_key, id);
    } else {
      const { data, error } = await svc.from("shop_listings").insert({ ...cols, archived_at: null }).select("id").single();
      if (error) throw merchNotReady(error) ? new MerchNotReady() : new Error(`merch listing insert: ${error.message}`);
      idByKey.set(l.group_key, data.id as string);
    }
  }

  const seenProducts = plan.listings.flatMap((l) => l.printful.map((p) => ({ sync_product_id: p.id, listing_id: idByKey.get(l.group_key)!, name: p.name, catalog_product_id: p.catalogId })));
  const productRows = seenProducts.map((p) => {
    const anyRow = plan.rows.find((r) => r.printful_sync_product_id === p.sync_product_id);
    return { ...p, thumbnail_url: anyRow?.image_url ?? null, variants: plan.rows.filter((r) => r.printful_sync_product_id === p.sync_product_id).length, synced_at: now, removed_at: null };
  });
  if (productRows.length) {
    // Keep a staff move: only set listing_id for products we haven't seen before.
    const { data: known } = await svc.from("shop_printful_products").select("sync_product_id, listing_id");
    const knownMap = new Map((known ?? []).map((k) => [Number(k.sync_product_id), k.listing_id as string | null]));
    const { error } = await svc.from("shop_printful_products").upsert(productRows.map((r) => ({ ...r, listing_id: knownMap.get(r.sync_product_id) ?? r.listing_id })), { onConflict: "sync_product_id" });
    if (error) throw new Error(`merch printful products: ${error.message}`);
  }
  await svc.from("shop_printful_products").update({ removed_at: now }).not("sync_product_id", "in", `(${seenProducts.map((p) => p.sync_product_id).join(",") || 0})`).is("removed_at", null);

  const rows = plan.rows.map(({ listing_key, ...r }) => ({ ...r, listing_id: idByKey.get(listing_key)!, updated_at: now }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await svc.from("shop_products").upsert(rows.slice(i, i + 200), { onConflict: "sku" });
    if (error) throw new Error(`merch rows: ${error.message}`);
  }
  const keep = new Set(rows.map((r) => r.sku));
  const { data: old } = await readAllPages<{ sku: string }>((from, to) => svc.from("shop_products").select("sku").eq("category", MERCH_CATEGORY).eq("printful_available", true).order("sku").range(from, to));
  const retire = (old ?? []).map((o) => o.sku as string).filter((s) => !keep.has(s));
  for (let i = 0; i < retire.length; i += 200) {
    await svc.from("shop_products").update({ active: false, printful_available: false, updated_at: now }).in("sku", retire.slice(i, i + 200));
  }
  return { ...plan.summary, retired: retire.length };
}

/** After staff change a listing (name, live, hidden colors) or move a product: rewrite its rows' names, prices and selling state. */
export async function resettleListing(listingId: string): Promise<void> {
  const svc = createServiceClient();
  const [{ data: listing }, { data: rows }] = await Promise.all([
    svc.from("shop_listings").select("name, live, hidden_colors, archived_at").eq("id", listingId).maybeSingle(),
    svc.from("shop_products").select("sku, color, option_value, printful_price_cents, printful_available, price_cents, active, name").eq("listing_id", listingId),
  ]);
  if (!listing) return;
  const settled = settleRows(listing as Pick<ListingRow, "name" | "live" | "hidden_colors" | "archived_at">, (rows ?? []) as (Pick<VariantRowInput, "color" | "option_value" | "printful_price_cents" | "printful_available" | "price_cents" | "active" | "name"> & { sku: string })[]);
  const now = new Date().toISOString();
  // An upsert of the changed columns (kind and name are required by the insert half, which never runs).
  const patch = settled.map((r) => ({ sku: r.sku, kind: "single", name: r.name, price_cents: r.price_cents, active: r.active, updated_at: now }));
  for (let i = 0; i < patch.length; i += 200) {
    const { error } = await svc.from("shop_products").upsert(patch.slice(i, i + 200), { onConflict: "sku" });
    if (error) throw new Error(`merch resettle: ${error.message}`);
  }
}
