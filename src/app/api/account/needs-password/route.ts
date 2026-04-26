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
import { userHasPassword } from "@/lib/auth-password";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const has = await userHasPassword(user.id);
  return NextResponse.json(
    { needsPassword: !has, hasPassword: has },
    { headers: { "Cache-Control": "no-store" } }
  );
}
