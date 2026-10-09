/**
 * GET /api/discord/bot/roles
 *
 * Returns the mentionable roles in one of the streamer's connected Discord
 * servers (?guild=) so the Account UI can render a role picker for the per-event
 * ping toggles. `@everyone` is intentionally stripped server-side —
 * the bot pings opt-in roles only.
 */

import { NextResponse } from "next/server";
import { botServer } from "@/lib/discord/botServer";
import { listGuildRoles } from "@/lib/adapters/discord/adapter";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ctx = await botServer(request);
  if (!ctx.ok) return ctx.response;
  const guildId = ctx.guild.guildId;

  const result = await listGuildRoles(guildId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, retryable: result.retryable },
      { status: 502 },
    );
  }
  return NextResponse.json({
    ok: true,
    roles: result.roles.map((r) => ({ id: r.id, name: r.name })),
  });
}
