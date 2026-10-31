/**
 * GameShuffle Competitive's servers for the signed-in account (picks 2026-10-30).
 *   GET                         { live, ready, limit, servers: [{ guildId, name, removedAt, settings, channels? }] }
 *                               ?guild=<id> also lists that server's text channels (the competitive bot reads them)
 *   PATCH { guild, settings }   merges channel settings (comp: { channel } for its posts)
 *   DELETE ?guild=<id>          forgets the server (the bot stays until someone removes it in Discord)
 *   POST { action: "panel", guild, channel, game }   posts (or moves) the time trial panel; game mk8dx | mkworld | both
 *   POST { action: "panel_remove", guild, game }     takes it down
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isProUser } from "@/lib/subscription-server";
import { compAppLive } from "@/lib/discord/appIds";
import { withDiscordApp } from "@/lib/discord/apps";
import { appGuildsReady, getAppGuild, listAppGuilds, removeAppGuild, updateAppGuildSettings } from "@/lib/discord/appGuilds";
import { serverLimit } from "@/lib/discord/guilds";
import { listTextChannels } from "@/lib/adapters/discord/adapter";
import { isPanelGame, postPanel, removePanel } from "@/lib/discord/ttPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function who() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET(request: Request) {
  const user = await who();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const live = compAppLive();
  const [ready, pro] = await Promise.all([appGuildsReady(), isProUser(user.id)]);
  const servers = live && ready ? await listAppGuilds(user.id, "comp") : [];
  const guild = new URL(request.url).searchParams.get("guild");
  let channels: { id: string; name: string }[] | null = null;
  if (guild && servers.some((s) => s.guildId === guild)) {
    const res = await withDiscordApp("comp", () => listTextChannels(guild));
    channels = res.ok ? res.channels.map((c) => ({ id: c.id, name: c.name })) : null;
  }
  return NextResponse.json({
    ok: true,
    live,
    ready,
    limit: serverLimit(pro),
    servers: servers.map((s) => ({ guildId: s.guildId, name: s.name, removedAt: s.removedAt, settings: s.settings })),
    channels,
  });
}

export async function PATCH(request: Request) {
  const user = await who();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { guild?: string; settings?: Record<string, unknown> };
  if (!body.guild || !body.settings) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  // Only channel ids (or null) for now.
  const channel = body.settings.channel;
  if (!(channel === null || (typeof channel === "string" && /^\d{5,25}$/.test(channel)))) return NextResponse.json({ ok: false, error: "bad_channel" }, { status: 400 });
  const ok = await updateAppGuildSettings(user.id, "comp", body.guild, { channel });
  if (!ok) return NextResponse.json({ ok: false, error: "not_yours" }, { status: 404 });
  return NextResponse.json({ ok: true, server: await getAppGuild("comp", body.guild) });
}

export async function DELETE(request: Request) {
  const user = await who();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const guild = new URL(request.url).searchParams.get("guild");
  if (!guild) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const ok = await removeAppGuild(user.id, "comp", guild);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}

export async function POST(request: Request) {
  const user = await who();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { action?: string; guild?: string; channel?: string; game?: string };
  if (!body.guild || !isPanelGame(body.game)) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const row = await getAppGuild("comp", body.guild);
  if (!row || row.ownerUserId !== user.id) return NextResponse.json({ ok: false, error: "not_yours" }, { status: 404 });
  if (body.action === "panel") {
    if (!body.channel || !/^\d{5,25}$/.test(body.channel)) return NextResponse.json({ ok: false, error: "bad_channel" }, { status: 400 });
    const res = await postPanel(body.guild, body.channel, body.game);
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    return NextResponse.json({ ok: true, pinned: res.pinned, server: await getAppGuild("comp", body.guild) });
  }
  if (body.action === "panel_remove") {
    const ok = await removePanel(body.guild, body.game);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  }
  return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
}
