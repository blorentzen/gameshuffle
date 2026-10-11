/**
 * GET  /api/admin/circuit-notice → where the Circuit launch email stands:
 *      launched, how many organizers used Circuit before the launch, how many
 *      have been emailed, and the free-until date it names (staff)
 * POST /api/admin/circuit-notice → email everyone not emailed yet (admins
 *      only, and only once the Circuit billing switch is on)
 *
 * Backs the launch email panel under Circuit billing on Platform ▸ Switches.
 * Terms §3.4 promises these organizers an email at least 30 days before any
 * charge; src/lib/tournaments/circuitNotice.ts has the rules.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";
import { circuitNoticeStatus, sendCircuitLaunchNotices } from "@/lib/tournaments/circuitNotice";

export const runtime = "nodejs";
export const maxDuration = 300;

async function gate(): Promise<{ ok: true; admin: boolean } | { ok: false; status: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401 };
  const { data } = await createServiceClient().from("users").select("role").eq("id", user.id).maybeSingle();
  const role = (data as { role?: string } | null)?.role ?? null;
  if (!isStaffRole(role)) return { ok: false, status: 403 };
  return { ok: true, admin: role === "admin" };
}

export async function GET() {
  const g = await gate();
  if (!g.ok) return NextResponse.json({ error: "forbidden" }, { status: g.status });
  return NextResponse.json({ ok: true, canSend: g.admin, ...(await circuitNoticeStatus()) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST() {
  const g = await gate();
  if (!g.ok) return NextResponse.json({ error: "forbidden" }, { status: g.status });
  if (!g.admin) return NextResponse.json({ error: "admins_only" }, { status: 403 });
  const result = await sendCircuitLaunchNotices();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(result);
}
