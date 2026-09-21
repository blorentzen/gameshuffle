/**
 * GET /api/account/profile-css → { css } (the stored, already-sanitized CSS)
 * PUT /api/account/profile-css  body: { css } → sanitize → save → { css, warnings }
 *
 * The raw input is sanitized (scoped + allowlisted + url-restricted) BEFORE it's
 * stored, so the DB only ever holds safe CSS. The /u render re-sanitizes on read
 * too. Authenticated; no tier gate. See src/lib/profile/customCss.ts.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { sanitizeCustomCss } from "@/lib/profile/customCss";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const admin = createServiceClient();
  const { data } = await admin.from("users").select("profile_custom_css").eq("id", user.id).maybeSingle();
  return NextResponse.json({ ok: true, css: (data as { profile_custom_css?: string | null } | null)?.profile_custom_css ?? "" });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { css?: unknown } | null;
  const { css, warnings } = sanitizeCustomCss(body?.css);

  const admin = createServiceClient();
  const { error } = await admin.from("users").update({ profile_custom_css: css || null }).eq("id", user.id);
  if (error) return NextResponse.json({ error: "migration_pending" }, { status: 503 });
  return NextResponse.json({ ok: true, css, warnings });
}
