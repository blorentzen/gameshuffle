/**
 * POST /api/account/password-later — "Not now" on /signup/set-password.
 * Sets the cookie that pauses the backup-password prompt for 30 days.
 * Staff and admins need a password, so they're refused.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { PASSWORD_LATER_COOKIE, PASSWORD_LATER_DAYS } from "@/lib/auth/passwordNudge";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { data: row } = await createServiceClient().from("users").select("role").eq("id", user.id).maybeSingle();
  if (row?.role === "staff" || row?.role === "admin") {
    return NextResponse.json({ error: "staff_need_password" }, { status: 403 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PASSWORD_LATER_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PASSWORD_LATER_DAYS * 86_400,
  });
  return res;
}
