/**
 * Community customization API.
 *   PATCH — update the community's tagline / blurb / accent (owner only).
 * `[id]` is the gs_communities id. See `supabase/community-customization-m1.sql`.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateCommunityCustomization } from "@/lib/communities/membership";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  let body: { tagline?: string | null; blurb?: string | null; accent?: string | null; hiddenSections?: unknown; pinnedPostId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const hiddenSections = Array.isArray(body.hiddenSections)
    ? body.hiddenSections.filter((k): k is string => typeof k === "string")
    : undefined;
  const result = await updateCommunityCustomization(user.id, id, {
    tagline: typeof body.tagline === "string" ? body.tagline : null,
    blurb: typeof body.blurb === "string" ? body.blurb : null,
    accent: typeof body.accent === "string" ? body.accent : null,
    hiddenSections,
    pinnedPostId: typeof body.pinnedPostId === "string" ? body.pinnedPostId : null,
  });
  if (!result.ok) {
    const status = result.reason === "forbidden" ? 403 : result.reason === "not_found" ? 404 : 400;
    return NextResponse.json({ ok: false, error: result.reason }, { status });
  }
  return NextResponse.json({ ok: true });
}
