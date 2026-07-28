/**
 * GET /api/tcg/catalog/browse → recently-populated paper cards for a visual
 * browse/example grid. Auth-required, 0 credits (read-only from tcg_cards,
 * never resolves live).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { browseRecentCatalog } from "@/lib/scrydex/catalog";
import { requireAuthedUser } from "@/lib/scrydex/routeAuth";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const auth = await requireAuthedUser(supabase);
  if (!auth.ok) {
    return NextResponse.json({ code: auth.code }, { status: auth.status });
  }
  const cards = await browseRecentCatalog(18);
  return NextResponse.json({ cards });
}
