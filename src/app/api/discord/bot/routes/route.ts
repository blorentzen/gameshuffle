/**
 * GET / PUT /api/discord/bot/routes
 *
 * Per-category channel routing (Discord Bot suite, Spec 1). GET returns the
 * streamer's install status, default channel, current routes, and Pro status.
 * PUT (GS Pro only) replaces the routes for the provided categories, validating
 * each channel id against the live guild channel list.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import { isRouteCategory } from "@/lib/discord/routeCategories";
import { listTextChannels } from "@/lib/adapters/discord/adapter";

export const runtime = "nodejs";

async function loadUser(userId: string) {
  const admin = createServiceClient();
  const { data } = await admin
    .from("users")
    .select("discord_guild_id, discord_guild_name, discord_channel_id, subscription_tier, role")
    .eq("id", userId)
    .maybeSingle();
  return data as {
    discord_guild_id: string | null;
    discord_guild_name: string | null;
    discord_channel_id: string | null;
    subscription_tier: string | null;
    role: string | null;
  } | null;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const admin = createServiceClient();
  const [profile, { data: routeRows }] = await Promise.all([
    loadUser(user.id),
    admin.from("discord_channel_routes").select("category, channel_id").eq("user_id", user.id),
  ]);

  const routes: Record<string, string> = {};
  for (const r of (routeRows ?? []) as Array<{ category: string; channel_id: string }>) {
    routes[r.category] = r.channel_id;
  }
  const isPro = effectiveTier({ tier: normalizeTier(profile?.subscription_tier ?? null), role: profile?.role ?? null }) === "pro";

  return NextResponse.json({
    ok: true,
    isPro,
    guildId: profile?.discord_guild_id ?? null,
    guildName: profile?.discord_guild_name ?? null,
    defaultChannelId: profile?.discord_channel_id ?? null,
    routes,
  });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const profile = await loadUser(user.id);
  const isPro = effectiveTier({ tier: normalizeTier(profile?.subscription_tier ?? null), role: profile?.role ?? null }) === "pro";
  if (!isPro) return NextResponse.json({ ok: false, error: "pro_required" }, { status: 403 });
  if (!profile?.discord_guild_id) {
    return NextResponse.json({ ok: false, error: "bot_not_installed" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const map = (body as { routes?: unknown })?.routes;
  if (!map || typeof map !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  // Validate channels against the live guild list.
  const channelsRes = await listTextChannels(profile.discord_guild_id);
  if (!channelsRes.ok) {
    return NextResponse.json({ ok: false, error: "channel_lookup_failed" }, { status: 502 });
  }
  const validChannels = new Set(channelsRes.channels.map((c) => c.id));

  const admin = createServiceClient();
  const upserts: Array<{ user_id: string; category: string; channel_id: string; updated_at: string }> = [];
  const clears: string[] = [];
  const now = new Date().toISOString();

  for (const [category, channelId] of Object.entries(map as Record<string, unknown>)) {
    if (!isRouteCategory(category)) continue;
    if (channelId == null || channelId === "") {
      clears.push(category);
    } else if (typeof channelId === "string" && validChannels.has(channelId)) {
      upserts.push({ user_id: user.id, category, channel_id: channelId, updated_at: now });
    } else {
      return NextResponse.json({ ok: false, error: "invalid_channel" }, { status: 400 });
    }
  }

  if (upserts.length) {
    const { error } = await admin.from("discord_channel_routes").upsert(upserts, { onConflict: "user_id,category" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (clears.length) {
    await admin.from("discord_channel_routes").delete().eq("user_id", user.id).in("category", clears);
  }
  return NextResponse.json({ ok: true });
}
