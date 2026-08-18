/**
 * GET /api/admin/lifecycle → lifecycle summary (signups, activity segments,
 * churn, marketing opt-ins) for the Platform Growth admin view. Staff/admin only.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { getLifecycleSummary } from "@/lib/platform/lifecycle";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const guard = await requireStaff(supabase);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const summary = await getLifecycleSummary();
  return NextResponse.json({ ok: true, summary });
}
