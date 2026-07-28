/**
 * GET  /api/admin/shop-cards   → list featured shop cards (staff/admin).
 * POST /api/admin/shop-cards   → add one { cardId, variantName?, label?, productUrl }.
 *
 * Platform-global shop promo cards. Staff/admin only. Adding resolves the
 * card's Scrydex catalog row (demand-driven).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import {
  addFeaturedShopCard,
  listFeaturedShopCards,
} from "@/lib/shop/featuredCards";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const guard = await requireStaff(supabase);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const cards = await listFeaturedShopCards();
  return NextResponse.json({ cards });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const guard = await requireStaff(supabase);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const body = await req.json().catch(() => null);
  const cardId = typeof body?.cardId === "string" ? body.cardId.trim() : "";
  const productUrl =
    typeof body?.productUrl === "string" ? body.productUrl.trim() : "";
  if (!cardId || !productUrl) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (!/^https:\/\/(www\.)?tcgplayer\.com\//.test(productUrl)) {
    return NextResponse.json({ error: "invalid_product_url" }, { status: 400 });
  }

  const result = await addFeaturedShopCard({
    cardId,
    variantName: typeof body?.variantName === "string" ? body.variantName : null,
    label: typeof body?.label === "string" ? body.label : null,
    productUrl,
    isSold: body?.isSold === true,
    soldAt: typeof body?.soldAt === "string" ? body.soldAt : null,
  });
  if (!result.ok) {
    const status = result.reason === "card_not_found" ? 404 : 400;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json({ ok: true });
}
