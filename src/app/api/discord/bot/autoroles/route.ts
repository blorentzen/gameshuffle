/**
 * GET / PUT /api/discord/bot/autoroles
 *
 * Roles auto-assigned to every new member on join (GS Pro). The gateway worker
 * applies them on GuildMemberAdd. PUT replaces the set for one server (?guild=).
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { botServer, proRequired } from "@/lib/discord/botServer";
import { listGuildRoles } from "@/lib/adapters/discord/adapter";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ctx = await botServer(request, { allowRemoved: true });
  if (!ctx.ok) return ctx.response.status === 404 ? NextResponse.json({ ok: true, roleIds: [] }) : ctx.response;
  const { data } = await createServiceClient()
    .from("discord_autoroles")
    .select("role_id")
    .eq("guild_id", ctx.guild.guildId);
  return NextResponse.json({ ok: true, roleIds: ((data ?? []) as Array<{ role_id: string }>).map((r) => r.role_id) });
}

export async function PUT(request: Request) {
  const ctx = await botServer(request);
  if (!ctx.ok) return ctx.response;
  const denied = proRequired(ctx);
  if (denied) return denied;
  const guildId = ctx.guild.guildId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const rawIds = Array.isArray((body as { roleIds?: unknown })?.roleIds) ? (body as { roleIds: unknown[] }).roleIds : [];

  const rolesRes = await listGuildRoles(guildId);
  if (!rolesRes.ok) return NextResponse.json({ ok: false, error: "guild_lookup_failed" }, { status: 502 });
  const validRoles = new Set(rolesRes.roles.map((r) => r.id));
  const roleIds = [...new Set(rawIds.filter((id): id is string => typeof id === "string" && validRoles.has(id)))].slice(0, 10);

  const admin = createServiceClient();
  // This server's set only (other servers keep theirs).
  const { error: clearErr } = await admin.from("discord_autoroles").delete().eq("guild_id", guildId);
  if (clearErr) return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  if (roleIds.length) {
    const { error } = await admin.from("discord_autoroles").insert(
      roleIds.map((role_id) => ({ user_id: ctx.userId, guild_id: guildId, role_id })),
    );
    if (error) return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
