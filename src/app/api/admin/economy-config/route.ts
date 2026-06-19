/**
 * GET /api/admin/economy-config — list every lever
 * PUT /api/admin/economy-config — upsert one row by key
 *
 * Backs the Platform Admin → Economy tab. Reads + writes the
 * `gs_economy_config` table that the engine queries on every hot-
 * path interaction via the `gs_economy_config_value(p_key, p_default)`
 * RPC. Edits land instantly — the RPC is uncached per Spec 01's
 * "single source of truth" intent.
 *
 * Staff/admin only. Direct SQL Editor access is the alternative
 * today; this API converts that to a UI flow.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";

export const runtime = "nodejs";

interface ConfigRow {
  key: string;
  value: number;
  updated_at: string;
}

async function requireStaff(): Promise<
  { ok: true } | { ok: false; status: number; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "unauthenticated" };
  const admin = createServiceClient();
  const { data } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (data as { role: string | null } | null)?.role ?? null;
  if (!isStaffRole(role)) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  return { ok: true };
}

export async function GET() {
  const auth = await requireStaff();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("gs_economy_config")
    .select("key, value, updated_at")
    .order("key", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    config: (data ?? []) as ConfigRow[],
  });
}

export async function PUT(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json().catch(() => null)) as {
    key?: string;
    value?: number | string;
  } | null;
  if (!body || !body.key || typeof body.key !== "string") {
    return NextResponse.json({ error: "key_required" }, { status: 400 });
  }
  // Permit string values from form-style submissions; coerce to int.
  const rawValue = body.value;
  const value =
    typeof rawValue === "number"
      ? rawValue
      : typeof rawValue === "string"
        ? parseInt(rawValue, 10)
        : NaN;
  if (!Number.isInteger(value) || value < 0) {
    return NextResponse.json(
      { error: "value_must_be_nonnegative_integer" },
      { status: 400 },
    );
  }
  const admin = createServiceClient();
  const { error } = await admin
    .from("gs_economy_config")
    .upsert(
      { key: body.key, value, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, key: body.key, value });
}
