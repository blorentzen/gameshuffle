/**
 * GET /api/admin/revenue: Platform ▸ Overview ▸ Revenue (staff). Subscribers,
 * trials and monthly revenue from the subscriptions mirror
 * (src/lib/billing/revenue.ts).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { revenueOverview } from "@/lib/billing/revenue";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  try {
    return NextResponse.json({ ok: true, ...(await revenueOverview()) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[admin/revenue] overview failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }
}
