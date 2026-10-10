/**
 * GET / PATCH / DELETE /api/discord/bot/routing?guild=<id>
 *
 * One connected server's bot settings (discord_guilds; ?guild= picks the
 * server, else the main one), plus the list of the account's servers for the
 * Discord Bot tab's picker:
 *   - channel_id             default channel (picked from the channel list)
 *   - notify_role_id         optional ping role
 *   - event_subscriptions    per-event posting on/off (defaults ON, except
 *                            `qotd`, which is opt-in)
 *   - event_pings            per-event @-mention on/off (defaults OFF; only
 *                            fires when the subscription is on and a role is set)
 *   - qotd_hour              this server's Question of the Day hour
 *   - make_main              make this the main server (the one that keeps
 *                            working without GS Pro)
 *
 * DELETE forgets the server: its settings, routes and AutoMod record go.
 * It doesn't remove the bot from Discord (the streamer kicks it there).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isProUser } from "@/lib/subscription-server";
import { guildIconUrl } from "@/lib/adapters/discord/adapter";
import { guildIsActive, listGuilds, pickGuild, removeGuild, serverLimit, setMainGuild, updateGuild, type GuildSettings } from "@/lib/discord/guilds";

export const runtime = "nodejs";

interface EventFlags {
  stream_live?: boolean;
  round_open?: boolean;
  round_close?: boolean;
  recap?: boolean;
  /** Daily Question-of-the-Day post. Unlike the others this defaults OFF
   *  (it posts on a schedule, not in reaction to the streamer) — see
   *  SUB_DEFAULTS in `src/lib/adapters/discord/index.ts`. */
  qotd?: boolean;
}

interface RoutingBody {
  channel_id?: string | null;
  notify_role_id?: string | null;
  event_subscriptions?: EventFlags;
  event_pings?: EventFlags;
  qotd_hour?: number | null;
  make_main?: boolean;
}

async function signedIn() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET(request: Request) {
  const user = await signedIn();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const [all, isPro] = await Promise.all([listGuilds(user.id), isProUser(user.id)]);
  const guild = await pickGuild(user.id, new URL(request.url).searchParams.get("guild"));
  return NextResponse.json({
    ok: true,
    routing: {
      guildId: guild?.guildId ?? null,
      guildName: guild?.name ?? null,
      channelId: guild?.defaultChannelId ?? null,
      notifyRoleId: guild?.notifyRoleId ?? null,
      eventSubscriptions: guild?.eventSubscriptions ?? null,
      eventPings: guild?.eventPings ?? null,
      qotdHour: guild?.qotdHour ?? null,
      isMain: guild?.isMain ?? false,
      removed: !!guild?.removedAt,
      active: guild ? guildIsActive(guild, isPro) : false,
    },
    servers: await Promise.all(all.map(async (g) => ({ guildId: g.guildId, name: g.name, iconUrl: g.removedAt ? null : await guildIconUrl(g.guildId), isMain: g.isMain, removed: !!g.removedAt, active: guildIsActive(g, isPro) }))),
    limit: serverLimit(isPro),
    isPro,
  });
}

export async function PATCH(request: Request) {
  const user = await signedIn();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  let body: RoutingBody;
  try {
    body = (await request.json()) as RoutingBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const guild = await pickGuild(user.id, new URL(request.url).searchParams.get("guild"));
  if (!guild) return NextResponse.json({ ok: false, error: "bot_not_installed" }, { status: 404 });

  // The default channel and "stream is live" are free; Question of the Day is
  // GS Pro, checked here because the Discord Bot tab only greys it out.
  if ((body.event_subscriptions?.qotd === true || (body.qotd_hour !== undefined && body.qotd_hour !== null)) && !(await isProUser(user.id))) {
    return NextResponse.json({ ok: false, error: "pro_required" }, { status: 403 });
  }
  if (body.make_main) {
    const ok = await setMainGuild(user.id, guild.guildId);
    if (!ok) return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }
  const patch: GuildSettings = {};
  if (body.channel_id !== undefined) patch.defaultChannelId = body.channel_id;
  if (body.notify_role_id !== undefined) patch.notifyRoleId = body.notify_role_id;
  if (body.event_subscriptions !== undefined) patch.eventSubscriptions = body.event_subscriptions as Record<string, boolean>;
  if (body.event_pings !== undefined) patch.eventPings = body.event_pings as Record<string, boolean>;
  if (body.qotd_hour !== undefined) patch.qotdHour = typeof body.qotd_hour === "number" ? Math.min(23, Math.max(0, Math.round(body.qotd_hour))) : null;
  if (Object.keys(patch).length > 0 && !(await updateGuild(user.id, guild.guildId, patch))) {
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await signedIn();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const guild = await pickGuild(user.id, new URL(request.url).searchParams.get("guild"));
  if (!guild) return NextResponse.json({ ok: true });
  if (!(await removeGuild(user.id, guild.guildId))) return NextResponse.json({ ok: false, error: "remove_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
