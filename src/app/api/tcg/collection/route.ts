/**
 * GET  /api/tcg/collection        → the user's owned cards.
 * POST /api/tcg/collection        → add a card; triggers resolveCard.
 *
 * Gated on the `companion.collection` capability, enforced server-side. That
 * capability is currently free for all signed-in accounts, so this is an auth
 * gate in practice; the capability layer lets it be re-gated to Pro later
 * (the 403 + machine-readable code path stays wired for that case).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProCollection } from "@/lib/scrydex/routeAuth";
import { addToCollection, listCollection } from "@/lib/scrydex/collection";
import { TCG_ERROR } from "@/lib/scrydex/types";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const auth = await requireProCollection(supabase);
  if (!auth.ok) {
    return NextResponse.json({ code: auth.code }, { status: auth.status });
  }
  try {
    const cards = await listCollection(supabase, auth.userId);
    return NextResponse.json({ cards });
  } catch (err) {
    console.error("[api/tcg/collection GET]", err);
    return NextResponse.json(
      { code: TCG_ERROR.UPSTREAM_ERROR },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const auth = await requireProCollection(supabase);
  if (!auth.ok) {
    return NextResponse.json({ code: auth.code }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  const cardId = typeof body?.cardId === "string" ? body.cardId.trim() : "";
  if (!cardId) {
    return NextResponse.json({ code: TCG_ERROR.BAD_REQUEST }, { status: 400 });
  }
  const variantName =
    typeof body?.variantName === "string" ? body.variantName : null;
  const quantity =
    typeof body?.quantity === "number" ? body.quantity : 1;
  const condition =
    typeof body?.condition === "string" ? body.condition : null;

  try {
    const result = await addToCollection(supabase, auth.userId, {
      cardId,
      variantName,
      quantity,
      condition,
    });
    if (!result.ok) {
      const status = result.reason === "card_not_found" ? 404 : 400;
      const code =
        result.reason === "card_not_found"
          ? TCG_ERROR.NOT_FOUND
          : TCG_ERROR.BAD_REQUEST;
      return NextResponse.json({ code, reason: result.reason }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/tcg/collection POST]", err);
    return NextResponse.json(
      { code: TCG_ERROR.UPSTREAM_ERROR },
      { status: 502 },
    );
  }
}
