/**
 * GET  /api/account/profile-layout → the user's normalized profile section layout
 * PUT  /api/account/profile-layout  body: { layout } → validate + save
 *
 * Controls the order + visibility of the widget blocks on /u plus a column
 * count. Stored on `users.profile_layout` (jsonb). Authenticated; no tier gate.
 *
 * SECURITY: every read AND write passes through `resolveProfileLayout`, which
 * allowlists section keys and clamps the column count — a stored blob can never
 * carry anything but known keys, and there's no free-text/markup in the shape.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveProfileLayout, DEFAULT_PROFILE_LAYOUT } from "@/lib/profile/layout";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const admin = createServiceClient();
  const { data } = await admin.from("users").select("profile_layout").eq("id", user.id).maybeSingle();
  const layout = resolveProfileLayout((data as { profile_layout?: unknown } | null)?.profile_layout);
  return NextResponse.json({ ok: true, layout });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { layout?: unknown } | null;
  // Normalize through the gate — anything unknown is dropped/clamped here.
  const layout = resolveProfileLayout(body?.layout ?? DEFAULT_PROFILE_LAYOUT);

  const admin = createServiceClient();
  const { error } = await admin.from("users").update({ profile_layout: layout }).eq("id", user.id);
  if (error) {
    // Column not applied yet → tell the client to try later, don't 500.
    return NextResponse.json({ error: "migration_pending" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, layout });
}
