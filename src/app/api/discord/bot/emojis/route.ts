/** GET /api/discord/bot/emojis — a connected server's custom emojis (?guild=) (for the
 *  role-menu emoji picker). Requires the bot installed. */

import { NextResponse } from "next/server";
import { botServer } from "@/lib/discord/botServer";
import { listGuildEmojis } from "@/lib/adapters/discord/adapter";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ctx = await botServer(request);
  if (!ctx.ok) return ctx.response;
  const guildId = ctx.guild.guildId;

  const result = await listGuildEmojis(guildId);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true, emojis: result.emojis });
}
