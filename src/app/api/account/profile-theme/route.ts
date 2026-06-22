/**
 * GET  /api/account/profile-theme  → the user's brand theme id + preview links
 * PUT  /api/account/profile-theme  body: { brandTheme }
 *
 * A personal brand theme any user can set. It re-skins their public profile
 * (/u/[username]); for streamers it also re-skins the OBS overlay + /live.
 * Stored on `users.profile_theme` (the resolver falls back to a legacy
 * `gs_communities.brand_theme` for streamers who set one before this existed).
 *
 * Authorization: authenticated. No community or tier gate.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import { getBrandThemeForOwner } from "@/lib/theme/brand-server";
import { brandThemeIds } from "@/lib/theme/brand";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const admin = createServiceClient();

  // Effective theme (users.profile_theme, else legacy community theme, else default).
  const brand = await getBrandThemeForOwner(user.id);

  // Preview-link context: public profile (any user) + live page (streamers).
  const { data: profile } = await admin
    .from("users")
    .select("username, is_public")
    .eq("id", user.id)
    .maybeSingle();

  let liveSlug: string | null = null;
  const communityId = await resolveCommunityIdForOwner(user.id);
  if (communityId) {
    const { data: community } = await admin
      .from("gs_communities")
      .select("slug")
      .eq("id", communityId)
      .maybeSingle();
    liveSlug = (community?.slug as string | null) ?? null;
  }

  return NextResponse.json({
    ok: true,
    brandTheme: brand.id,
    liveSlug,
    profileUsername: (profile?.username as string | null) ?? null,
    isPublic: !!profile?.is_public,
  });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { brandTheme?: unknown } | null;
  const brandTheme =
    typeof body?.brandTheme === "string" && brandThemeIds.includes(body.brandTheme)
      ? body.brandTheme
      : null;
  if (!brandTheme) return NextResponse.json({ error: "bad_theme" }, { status: 400 });

  const admin = createServiceClient();
  const { error } = await admin
    .from("users")
    .update({ profile_theme: brandTheme })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: "save_failed" }, { status: 500 });

  return NextResponse.json({ ok: true, brandTheme });
}
