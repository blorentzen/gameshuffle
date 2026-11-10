/**
 * GET /api/admin/cancellations: Platform ▸ Overview ▸ Revenue ▸ Why people cancel (staff). Reasons for
 * cancelling GS Pro, GS Circuit and monthly support, ours and Stripe's combined, and the latest comments
 * (src/lib/billing/cancellations.ts). `ready: false` before supabase/leave-reasons-m1.sql.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { cancellationSummary } from "@/lib/billing/cancellations";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  try {
    return NextResponse.json({ ok: true, ...(await cancellationSummary()) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[admin/cancellations] read failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }
}
