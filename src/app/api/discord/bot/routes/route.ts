/**
 * GET / PUT /api/discord/bot/routes
 *
 * Per-category channel routing for one server (?guild=, else the main one).
 * GET returns that server, its default channel, its routes and Pro status.
 * PUT (GS Pro only) replaces the routes for the provided categories, validating
 * each channel id against the live guild channel list.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isProUser } from "@/lib/subscription-server";
import { botServer, proRequired } from "@/lib/discord/botServer";
import { isRouteCategory } from "@/lib/discord/routeCategories";
import { listTextChannels } from "@/lib/adapters/discord/adapter";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ctx = await botServer(request, { allowRemoved: true });
  if (!ctx.ok) {
    // Not installed yet: the tab still renders (locked cards, the install
    // button), and still knows the account is Pro so it doesn't say "On Free".
    if (ctx.response.status === 404) {
      const { data: { user } } = await (await createClient()).auth.getUser();
      const isPro = user ? await isProUser(user.id) : false;
      return NextResponse.json({ ok: true, isPro, guildId: null, guildName: null, defaultChannelId: null, routes: {} });
    }
    return ctx.response;
  }
  const { data: routeRows } = await createServiceClient().from("discord_channel_routes").select("category, channel_id").eq("guild_id", ctx.guild.guildId);
  const routes: Record<string, string> = {};
  for (const r of (routeRows ?? []) as Array<{ category: string; channel_id: string }>) {
    routes[r.category] = r.channel_id;
  }
  return NextResponse.json({
    ok: true,
    isPro: ctx.isPro,
    guildId: ctx.guild.guildId,
    guildName: ctx.guild.name,
    defaultChannelId: ctx.guild.defaultChannelId,
    routes,
  });
}

export async function PUT(request: Request) {
  const ctx = await botServer(request);
  if (!ctx.ok) return ctx.response;
  const denied = proRequired(ctx);
  if (denied) return denied;

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
  const channelsRes = await listTextChannels(ctx.guild.guildId);
  if (!channelsRes.ok) {
    return NextResponse.json({ ok: false, error: "channel_lookup_failed" }, { status: 502 });
  }
  const validChannels = new Set(channelsRes.channels.map((c) => c.id));

  const admin = createServiceClient();
  const upserts: Array<{ user_id: string; guild_id: string; category: string; channel_id: string; updated_at: string }> = [];
  const clears: string[] = [];
  const now = new Date().toISOString();

  for (const [category, channelId] of Object.entries(map as Record<string, unknown>)) {
    if (!isRouteCategory(category)) continue;
    if (channelId == null || channelId === "") {
      clears.push(category);
    } else if (typeof channelId === "string" && validChannels.has(channelId)) {
      upserts.push({ user_id: ctx.userId, guild_id: ctx.guild.guildId, category, channel_id: channelId, updated_at: now });
    } else {
      return NextResponse.json({ ok: false, error: "invalid_channel" }, { status: 400 });
    }
  }

  if (upserts.length) {
    const { error } = await admin.from("discord_channel_routes").upsert(upserts, { onConflict: "guild_id,category" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (clears.length) {
    await admin.from("discord_channel_routes").delete().eq("guild_id", ctx.guild.guildId).in("category", clears);
  }
  return NextResponse.json({ ok: true });
}
