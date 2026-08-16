/**
 * PATCH  /api/admin/shop-cards/[id]  → { isSold?, isFeatured?, label?, productUrl?, sortOrder? }
 * DELETE /api/admin/shop-cards/[id]  → remove
 *
 * Staff/admin only. Marking sold flips the sold-out visual on the promo page.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import {
  removeFeaturedShopCard,
  updateFeaturedShopCard,
} from "@/lib/shop/featuredCards";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const guard = await requireStaff(supabase);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const patch: {
    isSold?: boolean;
    soldAt?: string | null;
    label?: string | null;
    productUrl?: string;
    sortOrder?: number;
    isFeatured?: boolean;
  } = {};
  if (typeof body?.isSold === "boolean") patch.isSold = body.isSold;
  if (typeof body?.isFeatured === "boolean") patch.isFeatured = body.isFeatured;
  if (typeof body?.soldAt === "string" || body?.soldAt === null) {
    patch.soldAt = body.soldAt;
  }
  if (typeof body?.label === "string" || body?.label === null) patch.label = body.label;
  if (typeof body?.productUrl === "string") {
    if (!/^https:\/\/(www\.)?tcgplayer\.com\//.test(body.productUrl)) {
      return NextResponse.json({ error: "invalid_product_url" }, { status: 400 });
    }
    patch.productUrl = body.productUrl;
  }
  if (typeof body?.sortOrder === "number") patch.sortOrder = body.sortOrder;

  const result = await updateFeaturedShopCard(id, patch);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const guard = await requireStaff(supabase);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { id } = await params;
  const result = await removeFeaturedShopCard(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
