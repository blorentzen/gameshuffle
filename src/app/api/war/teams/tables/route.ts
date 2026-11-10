/**
 * How war tables look in a server's channels (the Teams page; table look picks 2026-11-09, all as recommended). Same
 * access as /api/war/teams. A look's paid choices are saved either way; they show on tables while the account that
 * added GameShuffle Competitive to the server has GS Pro or Supporter looks (`paidShown`).
 *   GET  ?guild=<id>                         { ready, paidShown, channels: [{ id, name, wars, team, look, background }] }
 *   PUT  { guild, channel, look }            saves a channel's look → { look, held }
 *   PUT  { guild, channel, background: null } stops using the channel's saved background → { background: null }
 */

import { NextResponse } from "next/server";
import { compRest } from "@/lib/discord/compRest";
import { rateLimit } from "@/lib/ratelimit";
import { teamsAccess } from "@/lib/wars/teamAdmin";
import { channelTableLooks, clearChannelBackground, saveTableLook, serverHasLooks, tableLooksReady } from "@/lib/wars/tableLooks";
import { cleanTableLook, tablePaidUsed } from "@/lib/wars/tableLook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** The server's text channels the bot can see, in Discord's order (names come from Discord, so they're current). */
async function textChannels(guild: string): Promise<{ id: string; name: string }[]> {
  const res = await compRest<{ id: string; name?: string; type: number; position?: number; parent_id?: string | null }[]>("GET", `/guilds/${guild}/channels`);
  if (!res.ok || !Array.isArray(res.data)) return [];
  const cats = new Map(res.data.filter((c) => c.type === 4).map((c) => [c.id, c.position ?? 0]));
  return res.data
    .filter((c) => c.type === 0 || c.type === 5)
    .sort((a, b) => (cats.get(a.parent_id ?? "") ?? -1) - (cats.get(b.parent_id ?? "") ?? -1) || (a.position ?? 0) - (b.position ?? 0))
    .map((c) => ({ id: c.id, name: c.name ?? "channel" }));
}

export async function GET(req: Request) {
  const a = await teamsAccess(new URL(req.url).searchParams.get("guild"));
  if (!a.ok) return fail(a.error, a.status);
  if (!(await tableLooksReady())) return NextResponse.json({ ready: false, paidShown: false, channels: [] });
  const [wars, all, paidShown] = await Promise.all([channelTableLooks(a.guild), textChannels(a.guild), serverHasLooks(a.guild)]);
  const byId = new Map(wars.map((w) => [w.channelId, w]));
  const names = new Map(all.map((c) => [c.id, c.name]));
  // War channels first (newest war first), then the server's other text channels.
  const channels = [
    ...wars.map((w) => ({ id: w.channelId, name: names.get(w.channelId) ?? null, wars: true, team: w.team, look: w.look, background: w.background })),
    ...all.filter((c) => !byId.has(c.id)).map((c) => ({ id: c.id, name: c.name, wars: false, team: null, look: null, background: null })),
  ];
  return NextResponse.json({ ready: true, paidShown, channels });
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => null)) as { guild?: string; channel?: string; look?: unknown; background?: null } | null;
  const a = await teamsAccess(body?.guild);
  if (!a.ok) return fail(a.error, a.status);
  if (!(await tableLooksReady())) return fail("not_ready", 503);
  if (!(await rateLimit(`war-teams:${a.m.userId}`, { max: 120, windowMs: 10 * 60_000 })).ok) return fail("slow_down", 429);
  const channel = String(body?.channel ?? "");
  if (!/^\d{5,25}$/.test(channel)) return fail("bad_request", 400);
  // Only this server's channels: one GameShuffle has seen a war in, or one Discord lists for the server.
  const known = (await channelTableLooks(a.guild)).some((c) => c.channelId === channel) || (await textChannels(a.guild)).some((c) => c.id === channel);
  if (!known) return fail("gone", 404);
  if (body && "background" in body && body.background === null) {
    if (!(await clearChannelBackground(a.guild, channel))) return fail("failed", 500);
    return NextResponse.json({ background: null });
  }
  const look = cleanTableLook(body?.look);
  if (!(await saveTableLook(a.guild, channel, look))) return fail("failed", 500);
  const held = (await serverHasLooks(a.guild)) ? [] : tablePaidUsed(look);
  return NextResponse.json({ look, held });
}
