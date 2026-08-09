import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { validateUsername } from "@/lib/username";

/**
 * Handle availability + validation. GET /api/account/username?u=<handle>
 * Returns { available, value?, error? }. Validates format + reserved words
 * (server-side, so it can't be bypassed) and checks the handle isn't taken by
 * another account (case-insensitive; excludes the caller's own row).
 *
 * The DB (username-hardening.sql) is the real guard — a case-insensitive unique
 * index plus a format/reserved CHECK — this route is for pre-write UX so we don't
 * rely on string-matching a Postgres error message.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("u") ?? "";
  const check = validateUsername(raw);
  if (!check.ok) {
    return NextResponse.json({ available: false, error: check.error });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Service client so RLS on other users' rows doesn't hide a collision.
  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("users")
    .select("id")
    .eq("username", check.value) // handles are stored lowercase
    .maybeSingle();

  const taken = !!existing && existing.id !== user?.id;
  return NextResponse.json({
    available: !taken,
    value: check.value,
    error: taken ? "This username is already taken." : undefined,
  });
}
