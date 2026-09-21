/**
 * Community customization API.
 *   PATCH — update the community's tagline / blurb / accent (owner only).
 * `[id]` is the gs_communities id. See `supabase/community-customization-m1.sql`.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateCommunityCustomization, updateCommunitySkinCss } from "@/lib/communities/membership";
import { resolveProfileSkin } from "@/lib/profile/skin";
import { sanitizeCustomCss } from "@/lib/profile/customCss";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  let body: { tagline?: string | null; blurb?: string | null; accent?: string | null; hiddenSections?: unknown; pinnedPostId?: string | null; skin?: unknown; css?: unknown };
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

  // Skin + custom CSS (guarded/validated through the shared gates). Best-effort:
  // a pre-migration failure here doesn't fail the rest of the save.
  let warnings: string[] = [];
  if ("skin" in body || "css" in body) {
    const skin = resolveProfileSkin(body.skin);
    const { css, warnings: w } = sanitizeCustomCss(body.css);
    warnings = w;
    const r2 = await updateCommunitySkinCss(user.id, id, skin, css);
    if (!r2.ok && r2.reason !== "forbidden" && r2.reason !== "not_found") {
      // Column not applied yet — surface a soft warning, keep the main save.
      warnings = [...warnings, "Background/CSS couldn't be saved yet."];
    }
  }
  return NextResponse.json({ ok: true, warnings });
}
