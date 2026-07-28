/**
 * PATCH  /api/tcg/collection/[id]  → update quantity / condition, or toggle
 *                                    the profile showcase flag.
 * DELETE /api/tcg/collection/[id]  → remove a card.
 *
 * `[id]` is the `gs_user_cards.id` row id. RLS scopes every write to the
 * owner; the collection capability gate is enforced in the handler.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProCollection } from "@/lib/scrydex/routeAuth";
import {
  removeCollectionRow,
  setShowcase,
  updateCollectionRow,
} from "@/lib/scrydex/collection";
import { TCG_ERROR } from "@/lib/scrydex/types";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const auth = await requireProCollection(supabase);
  if (!auth.ok) {
    return NextResponse.json({ code: auth.code }, { status: auth.status });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ code: TCG_ERROR.BAD_REQUEST }, { status: 400 });
  }
  const body = await req.json().catch(() => null);

  // Showcase toggle is its own operation (has a cap) — handle it separately
  // from the quantity/condition patch.
  if (typeof body?.showcase === "boolean") {
    const result = await setShowcase(supabase, auth.userId, id, body.showcase);
    if (!result.ok) {
      return NextResponse.json(
        { code: TCG_ERROR.BAD_REQUEST, reason: result.reason },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  const patch: { quantity?: number; condition?: string | null } = {};
  if (typeof body?.quantity === "number") patch.quantity = body.quantity;
  if (typeof body?.condition === "string" || body?.condition === null) {
    patch.condition = body.condition;
  }

  const result = await updateCollectionRow(supabase, auth.userId, id, patch);
  if (!result.ok) {
    return NextResponse.json(
      { code: TCG_ERROR.BAD_REQUEST, reason: result.reason },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const auth = await requireProCollection(supabase);
  if (!auth.ok) {
    return NextResponse.json({ code: auth.code }, { status: auth.status });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ code: TCG_ERROR.BAD_REQUEST }, { status: 400 });
  }

  const result = await removeCollectionRow(supabase, auth.userId, id);
  if (!result.ok) {
    return NextResponse.json(
      { code: TCG_ERROR.BAD_REQUEST, reason: result.reason },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
