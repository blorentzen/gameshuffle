/**
 * GET /api/communities/availability?slug=... → live check for a would-be
 * community URL. Auth-gated (same audience as creation). Returns
 * { available: boolean, reason?: string } using the shared slug rules.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isCommunitySlugAvailable } from "@/lib/communities/membership";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ available: false, reason: "unauthenticated" }, { status: 401 });

  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  if (!slug) return NextResponse.json({ available: false, reason: "name_required" });
  const res = await isCommunitySlugAvailable(slug);
  return NextResponse.json(res);
}
