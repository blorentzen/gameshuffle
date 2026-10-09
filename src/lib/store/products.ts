import "server-only";

/**
 * Shop products with live availability (stock minus unexpired holds), read
 * with the service role through shop_availability() (supabase/shop-m1.sql).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { isOnSale, type ProductKind } from "./config";

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
}

type Row = {
  sku: string; kind: ProductKind; category: string; name: string; blurb: string | null; description: string | null; contents: string[] | null;
  price_cents: number; stripe_price_id: string | null; active: boolean; inactive_after: string | null;
  stock_available: number; max_per_order: number; ship_weight_oz: number | string; image_url: string | null; sort_order: number;
};

/** Every product in shelf order; `onlyOnSale` drops inactive and ended ones. */
export async function listShopProducts(opts: { onlyOnSale?: boolean } = {}): Promise<ShopProduct[]> {
  const svc = createServiceClient();
  const [{ data, error }, avail] = await Promise.all([
    svc.from("shop_products").select("*").order("sort_order"),
    svc.rpc("shop_availability"),
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
      };
    })
    .filter((p) => !opts.onlyOnSale || p.onSale);
}
