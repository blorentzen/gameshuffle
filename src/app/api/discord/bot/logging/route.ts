/**
 * GET / PATCH /api/discord/bot/logging?guild=<id>
 *
 * One server's logging config (GS Pro). GET returns the log channel and the
 * per-event toggles; PATCH saves them. The gateway worker reads these and
 * posts message deletes/edits, joins/leaves and role changes to the channel.
 * The channel must be one of that server's: logs never leave the server.
 */

import { NextResponse } from "next/server";
import { listTextChannels } from "@/lib/adapters/discord/adapter";
import { botServer, proRequired } from "@/lib/discord/botServer";
import { updateGuild, type GuildSettings } from "@/lib/discord/guilds";

export const runtime = "nodejs";

interface LogEvents {
  message_delete?: boolean;
  message_edit?: boolean;
  member_join?: boolean;
  member_leave?: boolean;
  role_change?: boolean;
}

export async function GET(request: Request) {
  const ctx = await botServer(request, { allowRemoved: true });
  if (!ctx.ok) return ctx.response.status === 404 ? NextResponse.json({ ok: true, channelId: null, events: null }) : ctx.response;
  return NextResponse.json({ ok: true, channelId: ctx.guild.logChannelId, events: ctx.guild.logEvents });
}

export async function PATCH(request: Request) {
  const ctx = await botServer(request);
  if (!ctx.ok) return ctx.response;
  // GS Pro, checked here: the Discord Bot tab only greys the card out.
  const denied = proRequired(ctx);
  if (denied) return denied;

  let body: { channel_id?: string | null; events?: LogEvents };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const patch: GuildSettings = {};
  if (body.channel_id !== undefined) {
    if (body.channel_id) {
      const channels = await listTextChannels(ctx.guild.guildId);
      if (!channels.ok) return NextResponse.json({ ok: false, error: "channel_lookup_failed" }, { status: 502 });
      if (!channels.channels.some((c) => c.id === body.channel_id)) return NextResponse.json({ ok: false, error: "invalid_channel" }, { status: 400 });
    }
    patch.logChannelId = body.channel_id || null;
  }
  if (body.events !== undefined) patch.logEvents = body.events as Record<string, boolean>;
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  if (!(await updateGuild(ctx.userId, ctx.guild.guildId, patch))) return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
