/**
 * Platform ▸ People ▸ Time trial reports (staff and admins).
 *   GET                               → reported times, oldest first
 *   POST { timeId, outcome: kept|removed } → closes the reports, removing the time when asked
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { openReports, resolveReports } from "@/lib/timeTrials/store";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  return NextResponse.json({ ok: true, reports: await openReports() }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const body = (await req.json().catch(() => ({}))) as { timeId?: unknown; outcome?: unknown };
  if (typeof body.timeId !== "string" || (body.outcome !== "kept" && body.outcome !== "removed")) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const ok = await resolveReports(body.timeId, body.outcome, gate.userId);
  return NextResponse.json({ ok });
}
