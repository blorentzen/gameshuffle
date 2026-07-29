/**
 * POST /api/tcg/collection/reorder — persist the favorite order.
 *
 * Body: `{ order: string[] }` — `gs_user_cards.id`s in the desired order. Each
 * is assigned its 0-based index as `showcase_rank`; the top MAX_SHOWCASE by
 * rank are what render on the public profile. Owner-scoped writes.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProCollection } from "@/lib/scrydex/routeAuth";
import { reorderShowcase } from "@/lib/scrydex/collection";
import { TCG_ERROR } from "@/lib/scrydex/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const auth = await requireProCollection(supabase);
  if (!auth.ok) {
    return NextResponse.json({ code: auth.code }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  const order = body?.order;
  if (
    !Array.isArray(order) ||
    order.some((id) => typeof id !== "string" || !id)
  ) {
    return NextResponse.json({ code: TCG_ERROR.BAD_REQUEST }, { status: 400 });
  }

  const result = await reorderShowcase(supabase, auth.userId, order as string[]);
  if (!result.ok) {
    return NextResponse.json(
      { code: TCG_ERROR.BAD_REQUEST, reason: result.reason },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
