/**
 * DELETE /api/admin/flavor-variables/[name]
 *
 * Removes a variable from the dictionary. Doesn't touch any events
 * that reference the variable — those will simply render the token
 * literally (e.g. `{streamer}`) in chat after deletion, which is the
 * intended "typo-safe" fallback.
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
  { params }: { params: Promise<{ name: string }> },
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
  const { name } = await params;
  if (!name) {
    return NextResponse.json({ error: "missing_name" }, { status: 400 });
  }
  const { error } = await admin
    .from("gs_flavor_variables")
    .delete()
    .eq("name", name);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
