/**
 * GET /api/admin/platform-flags → every flag row, who changed each last, and
 *     whether this viewer may change them (staff see, admins change)
 * PUT /api/admin/platform-flags { key, enabled } → set one switch (admins only,
 *     and only switches listed in src/lib/platform/switches.ts)
 *
 * Backs Platform admin ▸ Switches.
 */

import { SWITCHES } from "@/lib/platform/switches";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";
import { listPlatformFlags, setPlatformFlag, ensureBillingEnabledAt } from "@/lib/platform/flags";

export const runtime = "nodejs";

async function requireStaff(): Promise<{ ok: true; userId: string; admin: boolean } | { ok: false; status: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401 };
  const admin = createServiceClient();
  const { data } = await admin.from("users").select("role").eq("id", user.id).maybeSingle();
  const role = (data as { role?: string } | null)?.role ?? null;
  if (!isStaffRole(role)) return { ok: false, status: 403 };
  return { ok: true, userId: user.id, admin: role === "admin" };
}

export async function GET() {
  const gate = await requireStaff();
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: gate.status });
  const flags = await listPlatformFlags();
  const ids = [...new Set(flags.map((f) => f.updated_by).filter((x): x is string => !!x))];
  const { data: people } = ids.length ? await createServiceClient().from("users").select("id, display_name, username").in("id", ids) : { data: [] };
  const names = Object.fromEntries((people ?? []).map((p) => [p.id as string, (p.display_name as string) || (p.username as string) || "Staff"]));
  return NextResponse.json({ ok: true, flags, names, canEdit: gate.admin }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(req: NextRequest) {
  const gate = await requireStaff();
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: gate.status });

  const body = (await req.json().catch(() => ({}))) as { key?: unknown; enabled?: unknown };
  if (typeof body.key !== "string" || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "key + enabled required" }, { status: 400 });
  }
  if (!gate.admin) return NextResponse.json({ error: "admins_only" }, { status: 403 });
  if (!SWITCHES.some((s) => s.key === body.key)) return NextResponse.json({ error: "unknown_switch" }, { status: 400 });
  await setPlatformFlag(body.key, body.enabled, gate.userId);
  // The first time organizer billing turns ON, stamp the grandfathering anchor
  // (Circuit Phase 6) — tournaments created before this keep full access.
  if (body.key === "organizer_billing_enabled" && body.enabled === true) {
    await ensureBillingEnabledAt();
  }
  // The Terms (§3.4) and /gs-circuit read the switch; refresh them now rather
  // than at the next hourly revalidation.
  if (body.key === "organizer_billing_enabled") {
    revalidatePath("/terms");
    revalidatePath("/gs-circuit");
  }
  // The Terms (§3.6) describe the Supporter level by this switch.
  if (body.key === "support_supporter_looks") revalidatePath("/terms");
  return NextResponse.json({ ok: true });
}
