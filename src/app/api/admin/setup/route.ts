/**
 * GET /api/admin/setup → how many accounts have Twitch, Discord and the rest connected, whether it still works, and
 * who to reach out to when it broke (Platform admin ▸ Overview ▸ Setup). Staff/admin only.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { getSetupSummary } from "@/lib/platform/setup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const guard = await requireStaff(supabase);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const summary = await getSetupSummary();
    return NextResponse.json({ ok: true, summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[admin/setup] failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
