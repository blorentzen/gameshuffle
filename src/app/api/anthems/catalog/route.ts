/**
 * GET /api/anthems/catalog → { tracks }
 * Servable (cleared-provider) anthem catalog. Optional ?provider= filter.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listCatalog } from "@/lib/anthems/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const provider = new URL(req.url).searchParams.get("provider") ?? undefined;
  const tracks = await listCatalog({ provider, servableOnly: true });
  return NextResponse.json({ ok: true, tracks });
}
