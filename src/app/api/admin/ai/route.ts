/**
 * GET  /api/admin/ai → the Platform ▸ AI usage overview (last 30 days).
 * POST /api/admin/ai { proPer30d, freePerDay } → sets the two AI allowance
 *      levers (audited like any pricing lever). Staff/admin only.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { aiUsageOverview } from "@/lib/ai/adminUsage";
import { AI_LEVERS } from "@/lib/ai/usage";
import { setLever } from "@/lib/pricing/stripeSync";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  try {
    return NextResponse.json({ ok: true, ...(await aiUsageOverview()) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[admin/ai] overview failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const gate = await requireStaff(supabase);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const { data: { user } } = await supabase.auth.getUser();
  const body = (await request.json().catch(() => null)) as { proPer30d?: unknown; freePerDay?: unknown } | null;
  const pro = Number(body?.proPer30d), free = Number(body?.freePerDay);
  if (!Number.isInteger(pro) || pro < 0 || pro > 10_000 || !Number.isInteger(free) || free < 0 || free > 1_000) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  await setLever({ key: AI_LEVERS.proPer30d, valueNum: pro, actorId: user?.id ?? null });
  await setLever({ key: AI_LEVERS.freePerDay, valueNum: free, actorId: user?.id ?? null });
  return NextResponse.json({ ok: true });
}
