/**
 * /api/discord/bot/live-alerts?guild=<id> — go-live alerts for one server (GS Pro).
 *   GET                         → { routing, alerts, followed, limit }
 *   PUT    { channelId, roleId } where alerts post and who they ping (null clears)
 *   POST   { login } | { gsUserId }  add a creator (a Twitch name, or someone you follow)
 *   PATCH  { id, message?, enabled? }
 *   DELETE ?id=
 */

import { NextResponse } from "next/server";
import { listGuildRoles, listTextChannels } from "@/lib/adapters/discord/adapter";
import { botServer, proRequired } from "@/lib/discord/botServer";
import { LIVE_ALERT_LIMIT, addAlert, followedCreators, getRouting, listAlerts, removeAlert, setRouting, updateAlert } from "@/lib/discord/liveAlerts";

export const runtime = "nodejs";

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function GET(request: Request) {
  const ctx = await botServer(request, { allowRemoved: true });
  if (!ctx.ok) return ctx.response;
  const [routing, alerts, followed] = await Promise.all([
    getRouting(ctx.guild.guildId), listAlerts(ctx.guild.guildId), followedCreators(ctx.userId),
  ]);
  const added = new Set(alerts.map((a) => a.gsUserId).filter(Boolean));
  return NextResponse.json({
    ok: true, routing, alerts, limit: LIVE_ALERT_LIMIT,
    followed: followed.filter((f) => !added.has(f.userId)),
  });
}

export async function PUT(request: Request) {
  const ctx = await botServer(request);
  if (!ctx.ok) return ctx.response;
  const denied = proRequired(ctx);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { channelId?: unknown; roleId?: unknown } | null;
  const channelId = typeof body?.channelId === "string" && body.channelId ? body.channelId : null;
  const roleId = typeof body?.roleId === "string" && body.roleId ? body.roleId : null;
  if (channelId) {
    const ch = await listTextChannels(ctx.guild.guildId);
    if (!ch.ok) return bad("guild_lookup_failed", 502);
    if (!ch.channels.some((c) => c.id === channelId)) return bad("invalid_channel");
  }
  if (roleId) {
    const roles = await listGuildRoles(ctx.guild.guildId);
    if (!roles.ok) return bad("guild_lookup_failed", 502);
    if (!roles.roles.some((r) => r.id === roleId)) return bad("invalid_role");
  }
  if (!(await setRouting(ctx.userId, ctx.guild.guildId, { channelId, roleId }))) return bad("update_failed", 500);
  return NextResponse.json({ ok: true, routing: { channelId, roleId } });
}

export async function POST(request: Request) {
  const ctx = await botServer(request);
  if (!ctx.ok) return ctx.response;
  const denied = proRequired(ctx);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { login?: unknown; gsUserId?: unknown } | null;
  const r = await addAlert({
    ownerId: ctx.userId, guildId: ctx.guild.guildId,
    login: typeof body?.login === "string" ? body.login : undefined,
    gsUserId: typeof body?.gsUserId === "string" ? body.gsUserId : undefined,
  });
  if (!r.ok) return bad(r.error, r.error === "failed" ? 502 : 400);
  return NextResponse.json({ ok: true, alert: r.alert, alerts: await listAlerts(ctx.guild.guildId) });
}

export async function PATCH(request: Request) {
  const ctx = await botServer(request);
  if (!ctx.ok) return ctx.response;
  const denied = proRequired(ctx);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { id?: unknown; message?: unknown; enabled?: unknown } | null;
  if (typeof body?.id !== "string") return bad("invalid_body");
  const r = await updateAlert(ctx.guild.guildId, body.id, {
    message: typeof body.message === "string" || body.message === null ? (body.message as string | null) : undefined,
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
  });
  if (!r.ok) return bad(r.error);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const ctx = await botServer(request, { allowRemoved: true });
  if (!ctx.ok) return ctx.response;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!(await removeAlert(ctx.guild.guildId, id))) return bad("not_found", 404);
  return NextResponse.json({ ok: true, alerts: await listAlerts(ctx.guild.guildId) });
}
