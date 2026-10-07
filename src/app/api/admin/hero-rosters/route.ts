/**
 * GET /api/admin/hero-rosters → runs the hero roster check now (the same one
 * the monthly cron runs) for Platform ▸ Health. Staff/admin only.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { checkHeroRosters } from "@/lib/heroes/rosterCheck";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  return NextResponse.json({ ok: true, checks: await checkHeroRosters() }, { headers: { "Cache-Control": "private, no-store" } });
}
