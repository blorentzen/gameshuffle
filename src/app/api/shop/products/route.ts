/**
 * GET /api/shop/products?skus=a,b: the shop products for a cart's lines (price, stock, name, picture), so a page only
 * sends its cart the products it shows and the cart looks up the rest (2026-11-09). Public: it's the same data the
 * shop pages show. At most 60 SKUs a request; on-sale products only, like the pages.
 */

import { NextResponse, type NextRequest } from "next/server";
import { listShopProducts, ShopNotReady } from "@/lib/store/products";
import { rateLimit } from "@/lib/ratelimit";

const SKU = /^[A-Za-z0-9_.-]{1,80}$/;

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await rateLimit(`shop-products:${ip}`, { max: 60, windowMs: 60_000 })).ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const skus = [...new Set((request.nextUrl.searchParams.get("skus") ?? "").split(",").map((s) => s.trim()).filter((s) => SKU.test(s)))].slice(0, 60);
  if (!skus.length) return NextResponse.json({ products: [] });
  try {
    const products = await listShopProducts({ onlyOnSale: true, skus });
    return NextResponse.json({ products }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ShopNotReady) return NextResponse.json({ products: [] });
    console.error("[shop/products]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
