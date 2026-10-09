/**
 * GET /api/discord/bot/channels
 *
 * Returns the text channels in one of the streamer's connected Discord
 * servers (?guild=, else the main one) so the Account UI's channel picker has something to render.
 * Requires the bot to be installed (via /api/discord/bot/install/*) —
 * otherwise the guild call returns 403 from Discord.
 */

import { NextResponse } from "next/server";
import { botServer } from "@/lib/discord/botServer";
import { listTextChannels } from "@/lib/adapters/discord/adapter";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ctx = await botServer(request);
  if (!ctx.ok) return ctx.response;
  const guildId = ctx.guild.guildId;

  const result = await listTextChannels(guildId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, retryable: result.retryable },
      { status: 502 },
    );
  }
  return NextResponse.json({
    ok: true,
    channels: result.channels.map((c) => ({ id: c.id, name: c.name })),
  });
}
