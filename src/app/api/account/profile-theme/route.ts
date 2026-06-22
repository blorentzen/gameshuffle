/**
 * GET  /api/account/profile-theme  → the streamer's brand theme id
 * PUT  /api/account/profile-theme  body: { brandTheme }
 *
 * The brand theme re-skins the streamer's customer-facing surfaces (OBS
 * overlay + public /live page). Stored on `gs_communities.brand_theme`.
 *
 * Authorization: authenticated AND has a community (Twitch connected). No
 * tier gate — brand theming is channel branding, available to any streamer.
 * Streamers without a community get a 404 → the tab shows a connect CTA.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { ensureStreamerEconomyPresence } from "@/lib/economy/bootstrap";
import { DEFAULT_BRAND_THEME_ID, brandThemeIds } from "@/lib/theme/brand";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const presence = await ensureStreamerEconomyPresence(user);
  if (!presence) return NextResponse.json({ error: "no_community" }, { status: 404 });

  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_communities")
    .select("brand_theme")
    .eq("id", presence.communityId)
    .maybeSingle();

  // For the "preview your themed pages" links in the tab.
  const { data: profile } = await admin
    .from("users")
    .select("username, is_public")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    brandTheme: (data?.brand_theme as string | null) ?? DEFAULT_BRAND_THEME_ID,
    liveSlug: presence.communitySlug,
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

  const presence = await ensureStreamerEconomyPresence(user);
  if (!presence) return NextResponse.json({ error: "no_community" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { brandTheme?: unknown } | null;
  const brandTheme =
    typeof body?.brandTheme === "string" && brandThemeIds.includes(body.brandTheme)
      ? body.brandTheme
      : null;
  if (!brandTheme) return NextResponse.json({ error: "bad_theme" }, { status: 400 });

  const admin = createServiceClient();
  const { error } = await admin
    .from("gs_communities")
    .update({ brand_theme: brandTheme, brand_theme_updated_at: new Date().toISOString() })
    .eq("id", presence.communityId);
  if (error) return NextResponse.json({ error: "save_failed" }, { status: 500 });

  return NextResponse.json({ ok: true, brandTheme });
}
