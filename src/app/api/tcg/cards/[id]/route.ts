/**
 * GET /api/tcg/cards/[id]  → a single resolved card (cache-first, 1 credit on
 * cold/stale). Auth-required; free tier allowed (browsing is not gated).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCard } from "@/lib/scrydex/ingest";
import { requireAuthedUser } from "@/lib/scrydex/routeAuth";
import { TCG_ERROR } from "@/lib/scrydex/types";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const auth = await requireAuthedUser(supabase);
  if (!auth.ok) {
    return NextResponse.json({ code: auth.code }, { status: auth.status });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ code: TCG_ERROR.BAD_REQUEST }, { status: 400 });
  }

  try {
    const card = await resolveCard(id);
    if (!card) {
      return NextResponse.json({ code: TCG_ERROR.NOT_FOUND }, { status: 404 });
    }
    return NextResponse.json({ card });
  } catch (err) {
    console.error("[api/tcg/cards/[id]]", err);
    return NextResponse.json(
      { code: TCG_ERROR.UPSTREAM_ERROR },
      { status: 502 },
    );
  }
}
