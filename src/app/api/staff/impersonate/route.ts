/**
 * POST /api/staff/impersonate
 *
 * Toggles staff tier impersonation cookies. Per
 * gs-staff-tier-impersonation-spec.md §3.4 and addendum §16.6.
 *
 * Body: { option: 'default' | 'pro' | 'free' | 'unauth' }
 *
 * Setting cookies on a non-staff session is rejected with 403. The auth
 * resolution here intentionally bypasses the impersonation layer (we need
 * to see the *real* user role, not the impersonated view) so a staff
 * member impersonating-as-unauth can still hit this endpoint to exit.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  VIEW_AS_TIER_COOKIE,
  VIEW_AS_UNAUTH_COOKIE,
} from "@/lib/capabilities/staff-impersonation";

export const runtime = "nodejs";

type ImpersonationOption = "default" | "pro" | "free" | "unauth";

function isOption(v: unknown): v is ImpersonationOption {
  return v === "default" || v === "pro" || v === "free" || v === "unauth";
}

export async function POST(request: Request) {
  // Resolve the real user via Supabase. This auth path doesn't apply the
  // impersonation cookies — it reads from Supabase's session cookie, which
  // identifies the real user regardless of any view-as-* cookies.
  const supabase = await createClient();
  const {
    data: { user: rawUser },
  } = await supabase.auth.getUser();
  if (!rawUser) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Look up the real role server-side (don't trust client claims).
  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("id", rawUser.id)
    .maybeSingle();
  const role = (profile?.role as string | null) ?? null;
  if (role !== "staff" && role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const option = body.option;
  if (!isOption(option)) {
    return NextResponse.json({ error: "invalid_option" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true, option }, { status: 200 });
  const cookieAttrs = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };

  switch (option) {
    case "default":
      response.cookies.delete({ name: VIEW_AS_TIER_COOKIE, path: "/" });
      response.cookies.delete({ name: VIEW_AS_UNAUTH_COOKIE, path: "/" });
      break;
    case "pro":
      response.cookies.set({ name: VIEW_AS_TIER_COOKIE, value: "pro", ...cookieAttrs });
      response.cookies.delete({ name: VIEW_AS_UNAUTH_COOKIE, path: "/" });
      break;
    case "free":
      response.cookies.set({ name: VIEW_AS_TIER_COOKIE, value: "free", ...cookieAttrs });
      response.cookies.delete({ name: VIEW_AS_UNAUTH_COOKIE, path: "/" });
      break;
    case "unauth":
      response.cookies.delete({ name: VIEW_AS_TIER_COOKIE, path: "/" });
      response.cookies.set({ name: VIEW_AS_UNAUTH_COOKIE, value: "true", ...cookieAttrs });
      break;
  }

  return response;
}
