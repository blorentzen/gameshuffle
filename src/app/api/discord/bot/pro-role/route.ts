/**
 * GET / PUT /api/discord/bot/pro-role?guild=<id>
 *
 * The "GS Pro" role in one of the streamer's servers: GameShuffle keeps it in
 * sync with each linked member's GS Pro tier (worker on join + reconcile
 * cron). GS Pro only. PUT { roleId: string | null } (null clears it).
 */

import { NextResponse } from "next/server";
import { listGuildRoles } from "@/lib/adapters/discord/adapter";
import { botServer, proRequired } from "@/lib/discord/botServer";
import { updateGuild } from "@/lib/discord/guilds";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ctx = await botServer(request, { allowRemoved: true });
  if (!ctx.ok) return ctx.response.status === 404 ? NextResponse.json({ ok: true, roleId: null }) : ctx.response;
  return NextResponse.json({ ok: true, roleId: ctx.guild.proRoleId });
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
  const roleId = (body as { roleId?: unknown })?.roleId;

  let value: string | null = null;
  if (typeof roleId === "string" && roleId) {
    const rolesRes = await listGuildRoles(ctx.guild.guildId);
    if (!rolesRes.ok) return NextResponse.json({ ok: false, error: "guild_lookup_failed" }, { status: 502 });
    if (!rolesRes.roles.some((r) => r.id === roleId)) {
      return NextResponse.json({ ok: false, error: "invalid_role" }, { status: 400 });
    }
    value = roleId;
  }

  if (!(await updateGuild(ctx.userId, ctx.guild.guildId, { proRoleId: value }))) {
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
