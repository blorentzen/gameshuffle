/**
 * GET /api/account/profile-links → { links, spotlight } (normalized)
 * PUT /api/account/profile-links  body: { links?, spotlight? } → validate + save
 *
 * Stored on `users.profile_links` + `users.profile_spotlight`. Authenticated.
 *
 * SECURITY: both pass through their resolvers — links are https-only, the
 * spotlight is a parsed id/slug/name (never a raw embed URL). A poisoned blob
 * can't carry anything the resolvers don't allow.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveProfileLinks, resolveProfileSpotlight } from "@/lib/profile/links";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const admin = createServiceClient();
  const { data } = await admin.from("users").select("profile_links, profile_spotlight").eq("id", user.id).maybeSingle();
  const row = (data ?? {}) as { profile_links?: unknown; profile_spotlight?: unknown };
  return NextResponse.json({ ok: true, links: resolveProfileLinks(row.profile_links), spotlight: resolveProfileSpotlight(row.profile_spotlight) });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { links?: unknown; spotlight?: unknown } | null;
  const links = resolveProfileLinks(body?.links ?? []);
  const spotlight = resolveProfileSpotlight(body?.spotlight);

  const admin = createServiceClient();
  const { error } = await admin.from("users").update({ profile_links: links, profile_spotlight: spotlight }).eq("id", user.id);
  if (error) return NextResponse.json({ error: "migration_pending" }, { status: 503 });
  return NextResponse.json({ ok: true, links, spotlight });
}
