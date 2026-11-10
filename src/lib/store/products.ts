import "server-only";

/**
 * Shop products with live availability (stock minus unexpired holds), read
 * with the service role through shop_availability() (supabase/shop-m1.sql).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { readAllPages } from "@/lib/supabase/pages";
import { isOnSale, type ProductKind } from "./config";
import { PERSONAL, type PersonalProduct } from "./personal";

export class ShopNotReady extends Error {
  constructor() { super("The shop needs supabase/shop-m1.sql"); this.name = "ShopNotReady"; }
}
const notReady = (e: { code?: string } | null) => e?.code === "42P01" || e?.code === "PGRST205" || e?.code === "42883" || e?.code === "PGRST202";

export interface ShopProduct {
  sku: string;
  kind: ProductKind;
  category: string;
  name: string;
  blurb: string | null;
  description: string | null;
  contents: string[];
  priceCents: number;
  stripePriceId: string | null;
  onSale: boolean;
  stock: number;
  held: number;
  available: number;
  maxPerOrder: number;
  shipWeightOz: number;
  imageUrl: string | null;
  sortOrder: number;
  /** Merch (merch-m1.sql): the shop product it belongs to, and its color and size or phone. Null for card packs. */
  listingId: string | null;
  color: string | null;
  optionValue: string | null;
  /** Made when ordered: the kind of pick and the ink its print files use (null for everything else). */
  personal: PersonalProduct | null;
}

type Row = {
  sku: string; kind: ProductKind; category: string; name: string; blurb: string | null; description: string | null; contents: string[] | null;
  price_cents: number; stripe_price_id: string | null; active: boolean; inactive_after: string | null;
  stock_available: number; max_per_order: number; ship_weight_oz: number | string; image_url: string | null; sort_order: number;
  listing_id?: string | null; color?: string | null; option_value?: string | null; printful_sync_product_id?: number | string | null;
};

/** Every product in shelf order; `onlyOnSale` drops inactive and ended ones. */
export async function listShopProducts(opts: { onlyOnSale?: boolean; skus?: string[] } = {}): Promise<ShopProduct[]> {
  const svc = createServiceClient();
  const skus = opts.skus;
  // Merch alone is thousands of rows (a size and color each), past the 1,000 a request returns: page both reads.
  // `skus` reads only those (a cart's lines).
  const [{ data, error }, avail] = await Promise.all([
    readAllPages<Row & { archived_at?: string | null }>((from, to) => {
      const q = svc.from("shop_products").select("*");
      return (skus ? q.in("sku", skus) : q).order("sort_order").order("sku").range(from, to);
    }),
    readAllPages<{ sku: string; held: number; available: number }>((from, to) => {
      const q = svc.rpc("shop_availability");
      return (skus ? q.in("sku", skus) : q).order("sku").range(from, to);
    }),
  ]);
  if (notReady(error) || notReady(avail.error)) throw new ShopNotReady();
  if (error) throw new Error(`shop products: ${error.message}`);
  const bySku = new Map(((avail.data ?? []) as { sku: string; held: number; available: number }[]).map((a) => [a.sku, a]));
  const now = new Date();
  return ((data ?? []) as (Row & { archived_at?: string | null })[])
    .filter((r) => !r.archived_at)
    .map((r) => {
      const a = bySku.get(r.sku);
      return {
        sku: r.sku, kind: r.kind, category: r.category, name: r.name, blurb: r.blurb, description: r.description, contents: r.contents ?? [],
        priceCents: r.price_cents, stripePriceId: r.stripe_price_id, onSale: isOnSale(r, now),
        stock: r.stock_available, held: a?.held ?? 0, available: a?.available ?? Math.max(0, r.stock_available),
        maxPerOrder: r.max_per_order, shipWeightOz: Number(r.ship_weight_oz), imageUrl: r.image_url, sortOrder: r.sort_order,
        listingId: r.listing_id ?? null, color: r.color ?? null, optionValue: r.option_value ?? null,
        personal: r.printful_sync_product_id ? PERSONAL.products[String(r.printful_sync_product_id)] ?? null : null,
      };
    })
    .filter((p) => !opts.onlyOnSale || p.onSale);
}

/**
 * What a page hands its cart up front: the card packs (the cart suggests them), plus one product's own sizes and colors
 * on its page. Every merch size and color was sent to every visitor before (3,910 of them, 2 MB of /shop, 2026-11-09);
 * the cart now looks up merch already in it through /api/shop/products.
 */
export function cartSeed(products: ShopProduct[], listingId?: string | null): ShopProduct[] {
  return products.filter((p) => p.category !== "merch" || (!!listingId && p.listingId === listingId));
}
