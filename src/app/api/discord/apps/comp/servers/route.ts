/**
 * GameShuffle Competitive's servers for the signed-in account (picks 2026-10-30).
 *   GET                         { live, ready, limit, servers: [{ guildId, name, removedAt, settings, channels? }] }
 *                               ?guild=<id> also lists that server's text channels (the competitive bot reads them)
 *   PATCH { guild, settings }   merges channel settings (comp: { channel } for its posts)
 *   PATCH { guild, lounge }     lounge posts in this server: { rankUps?, rolesGame?, boardGame? } (roles and the board
 *                               are GS Pro). GameShuffle's lounge settings for the server come along the first time.
 *   PATCH { guild, speedrun }   speedrun posts: { pbs?, pace?, paceRole? } (pace alerts are GS Pro); ?guild= GETs list
 *                               the server's roles for the ping
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
import { listGuildRoles, listTextChannels } from "@/lib/adapters/discord/adapter";
import { readCompSpeedrun, type CompSpeedrun } from "@/lib/speedrun/compDiscord";
import { createServiceClient } from "@/lib/supabase/admin";
import { isMmrGame } from "@/lib/mmr/rules";
import { EMPTY_COMP_LOUNGE, readCompLounge, type CompLounge } from "@/lib/lounge/compLounge";
import { isPanelGame, postPanel, removePanel } from "@/lib/discord/ttPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function who() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** A server's lounge settings: its own, else GameShuffle's for the same server (carried over), else off. */
async function effectiveLounge(guildId: string, settings: Record<string, unknown>): Promise<{ lounge: CompLounge; carried: boolean }> {
  const own = readCompLounge(settings);
  if (own) return { lounge: own, carried: false };
  const { data } = await createServiceClient().from("discord_guilds")
    .select("event_subscriptions, lounge_roles_game, lounge_board_game, lounge_role_ids, lounge_board_week").eq("guild_id", guildId).is("removed_at", null).maybeSingle();
  const m = data as { event_subscriptions: Record<string, boolean> | null; lounge_roles_game: string | null; lounge_board_game: string | null; lounge_role_ids: Record<string, string> | null; lounge_board_week: string | null } | null;
  if (!m) return { lounge: EMPTY_COMP_LOUNGE, carried: false };
  const lounge: CompLounge = {
    rankUps: m.event_subscriptions?.lounge === true,
    rolesGame: isMmrGame(m.lounge_roles_game) ? m.lounge_roles_game : null,
    boardGame: isMmrGame(m.lounge_board_game) ? m.lounge_board_game : null,
    roleIds: m.lounge_role_ids ?? {},
    boardWeek: m.lounge_board_week,
  };
  return { lounge, carried: lounge.rankUps || !!lounge.rolesGame || !!lounge.boardGame };
}

export async function GET(request: Request) {
  const user = await who();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const live = compAppLive();
  const [ready, pro] = await Promise.all([appGuildsReady(), isProUser(user.id)]);
  const servers = live && ready ? await listAppGuilds(user.id, "comp") : [];
  const guild = new URL(request.url).searchParams.get("guild");
  let channels: { id: string; name: string }[] | null = null;
  let roles: { id: string; name: string }[] | null = null;
  if (guild && servers.some((s) => s.guildId === guild)) {
    const [res, rr] = await withDiscordApp("comp", () => Promise.all([listTextChannels(guild), listGuildRoles(guild)]));
    channels = res.ok ? res.channels.map((c) => ({ id: c.id, name: c.name })) : null;
    roles = rr.ok ? rr.roles.map((r) => ({ id: r.id, name: r.name })) : null;
  }
  return NextResponse.json({
    ok: true,
    live,
    ready,
    limit: serverLimit(pro),
    pro,
    servers: await Promise.all(servers.map(async (s) => {
      const { lounge, carried } = await effectiveLounge(s.guildId, s.settings);
      return { guildId: s.guildId, name: s.name, removedAt: s.removedAt, settings: s.settings, lounge: { rankUps: lounge.rankUps, rolesGame: lounge.rolesGame, boardGame: lounge.boardGame, carried }, speedrun: readCompSpeedrun(s.settings) };
    })),
    channels,
    roles,
  });
}

export async function PATCH(request: Request) {
  const user = await who();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { guild?: string; settings?: Record<string, unknown>; lounge?: Record<string, unknown>; speedrun?: Record<string, unknown> };
  if (body.guild && body.speedrun) {
    const g = await getAppGuild("comp", body.guild);
    if (!g || g.ownerUserId !== user.id) return NextResponse.json({ ok: false, error: "not_yours" }, { status: 404 });
    const next: CompSpeedrun = { ...readCompSpeedrun(g.settings) };
    if (body.speedrun.pbs !== undefined) next.pbs = body.speedrun.pbs === true;
    if (body.speedrun.pace !== undefined) {
      if (body.speedrun.pace === true && !(await isProUser(user.id))) return NextResponse.json({ ok: false, error: "pro_required" }, { status: 403 });
      next.pace = body.speedrun.pace === true;
    }
    if (body.speedrun.paceRole !== undefined) {
      const r = body.speedrun.paceRole;
      if (!(r === null || r === "" || (typeof r === "string" && /^\d{5,25}$/.test(r)))) return NextResponse.json({ ok: false, error: "bad_role" }, { status: 400 });
      next.paceRole = r ? String(r) : null;
    }
    await updateAppGuildSettings(user.id, "comp", body.guild, { speedrun: next });
    return NextResponse.json({ ok: true, speedrun: next });
  }
  if (body.guild && body.lounge) {
    const g = await getAppGuild("comp", body.guild);
    if (!g || g.ownerUserId !== user.id) return NextResponse.json({ ok: false, error: "not_yours" }, { status: 404 });
    const game = (v: unknown) => (v === null || v === "" ? null : isMmrGame(v) ? v : undefined);
    const { lounge } = await effectiveLounge(body.guild, g.settings);
    const next: CompLounge = { ...lounge };
    if (body.lounge.rankUps !== undefined) next.rankUps = body.lounge.rankUps === true;
    for (const key of ["rolesGame", "boardGame"] as const) {
      if (body.lounge[key] === undefined) continue;
      const v = game(body.lounge[key]);
      if (v === undefined) return NextResponse.json({ ok: false, error: "bad_game" }, { status: 400 });
      if (v && !(await isProUser(user.id))) return NextResponse.json({ ok: false, error: "pro_required" }, { status: 403 });
      next[key] = v;
    }
    await updateAppGuildSettings(user.id, "comp", body.guild, { lounge: next });
    return NextResponse.json({ ok: true, lounge: { rankUps: next.rankUps, rolesGame: next.rolesGame, boardGame: next.boardGame, carried: false } });
  }
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
