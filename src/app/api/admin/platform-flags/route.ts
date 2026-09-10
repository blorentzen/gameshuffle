/**
 * GET /api/admin/platform-flags — list every platform flag
 * PUT /api/admin/platform-flags — set one flag ({ key, enabled })
 *
 * Backs the Platform Admin feature-flags control. Staff/admin only.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";
import { listPlatformFlags, setPlatformFlag } from "@/lib/platform/flags";

export const runtime = "nodejs";

async function requireStaff(): Promise<{ ok: true; userId: string } | { ok: false; status: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401 };
  const admin = createServiceClient();
  const { data } = await admin.from("users").select("role").eq("id", user.id).maybeSingle();
  if (!isStaffRole((data as { role?: string } | null)?.role ?? null)) return { ok: false, status: 403 };
  return { ok: true, userId: user.id };
}

export async function GET() {
  const gate = await requireStaff();
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: gate.status });
  return NextResponse.json({ ok: true, flags: await listPlatformFlags() });
}

export async function PUT(req: NextRequest) {
  const gate = await requireStaff();
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: gate.status });

  const body = (await req.json().catch(() => ({}))) as { key?: unknown; enabled?: unknown };
  if (typeof body.key !== "string" || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "key + enabled required" }, { status: 400 });
  }
  await setPlatformFlag(body.key, body.enabled, gate.userId);
  return NextResponse.json({ ok: true });
}
