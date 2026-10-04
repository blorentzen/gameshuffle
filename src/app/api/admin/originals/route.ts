/**
 * GET /api/admin/originals → the Platform ▸ Originals overview (Chat Brain,
 * Daily, Weekly). Staff/admin only.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { originalsOverview } from "@/lib/originals/overview";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  return NextResponse.json({ ok: true, ...(await originalsOverview()) }, { headers: { "Cache-Control": "private, no-store" } });
}
