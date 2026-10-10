/**
 * GET /api/account/needs-password
 *
 * Returns `{ needsPassword: boolean }` for the authenticated user.
 *
 * Used by the middleware (to decide whether to force a redirect to
 * /signup/set-password) and by client components like the set-password
 * page itself + the security-tab banner.
 *
 * No-cache because the answer can flip the moment the user finishes
 * the set-password flow.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { userHasPassword } from "@/lib/auth-password";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const [has, roleRow] = await Promise.all([
    userHasPassword(user.id),
    createServiceClient().from("users").select("role").eq("id", user.id).maybeSingle(),
  ]);
  // Staff and admins can't put it off (see src/lib/auth/passwordNudge.ts).
  const canSkip = roleRow.data?.role !== "staff" && roleRow.data?.role !== "admin";
  return NextResponse.json(
    { needsPassword: !has, hasPassword: has, canSkip },
    { headers: { "Cache-Control": "no-store" } }
  );
}
