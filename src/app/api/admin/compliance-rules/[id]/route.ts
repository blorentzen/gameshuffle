/**
 * DELETE /api/admin/compliance-rules/[id]
 *
 * Remove a compliance rule. The (region × class × genre) uniqueness
 * constraint means deletes are clean — no cascading FKs.
 *
 * Staff/admin only.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profile as { role: string | null } | null)?.role ?? null;
  if (!isStaffRole(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const numericId = parseInt(id, 10);
  if (!Number.isInteger(numericId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const { error } = await admin
    .from("gs_compliance_rules")
    .delete()
    .eq("id", numericId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
