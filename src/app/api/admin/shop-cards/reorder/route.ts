/**
 * POST /api/admin/shop-cards/reorder → persist a new featured-card order.
 * Body: { ids: string[] } — the available cards in their new top-to-bottom
 * order. Staff/admin only.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { reorderFeaturedShopCards } from "@/lib/shop/featuredCards";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const guard = await requireStaff(supabase);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const body = await req.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids : null;
  if (!ids || !ids.every((id: unknown) => typeof id === "string")) {
    return NextResponse.json({ error: "invalid_ids" }, { status: 400 });
  }

  const result = await reorderFeaturedShopCards(ids as string[]);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
