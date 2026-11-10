/**
 * A server's team cards on GameShuffle (the Teams page, overrides picks 2026-11-09). The account that added
 * GameShuffle Competitive to the server, and staff (the same as the logos route); on the site they count as able to
 * manage the server. Every answer that changes something carries the page's fresh view.
 *   GET    ?guild=<id>                                   { ready, view }
 *   POST   { guild, id?, name, tags, color }             makes or changes a team → { team, created, view }
 *   DELETE ?guild=<id>&id=<team>                          removes a team and its players → { view }
 */

import { after, NextResponse } from "next/server";
import { redrawSides } from "@/lib/wars/redraw";
import { rateLimit } from "@/lib/ratelimit";
import { cardsReady, listTeams, removeTeam, saveTeam } from "@/lib/wars/cardStore";
import { tagTaken } from "@/lib/wars/cards";
import { teamIn, teamsAccess, teamsView } from "@/lib/wars/teamAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });

export async function GET(req: Request) {
  const a = await teamsAccess(new URL(req.url).searchParams.get("guild"));
  if (!a.ok) return fail(a.error, a.status);
  const view = await teamsView(a.guild);
  return NextResponse.json({ ready: !!view, view });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { guild?: string; id?: string | null; name?: string | null; tags?: unknown; color?: string | null } | null;
  if (!body) return fail("bad_request", 400);
  const a = await teamsAccess(body.guild);
  if (!a.ok) return fail(a.error, a.status);
  if (!(await cardsReady())) return fail("not_ready", 503);
  if (!(await rateLimit(`war-teams:${a.m.userId}`, { max: 120, windowMs: 10 * 60_000 })).ok) return fail("slow_down", 429);
  if (body.id && !(await teamIn(a.guild, body.id))) return fail("gone", 404);
  const tags = Array.isArray(body.tags) ? body.tags.map((t) => String(t ?? "")) : [];
  // A new team never takes over another's card (saveTeam without an id changes the card that has its first tag).
  if (!body.id) {
    const all = await listTeams(a.guild);
    for (const t of tags) {
      const other = tagTaken(all, t, null);
      if (other) return fail("tag_taken", 409, { other: { name: other.name, tags: other.tags } });
    }
  }
  const res = await saveTeam(a.guild, { id: body.id ?? null, name: body.name ?? null, tags, color: body.color ?? null }, a.by, true);
  if (!res.ok) {
    return fail(res.error, res.error === "not_ready" ? 503 : res.error === "tag_taken" ? 409 : 400, res.other ? { other: { name: res.other.name, tags: res.other.tags } } : {});
  }
  // Live war cards showing the team take its new name, tags and logo.
  after(async () => { await redrawSides(a.guild, [...res.team.tags, ...tags]); });
  return NextResponse.json({ team: { id: res.team.id }, created: res.created, view: await teamsView(a.guild) });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const a = await teamsAccess(url.searchParams.get("guild"));
  if (!a.ok) return fail(a.error, a.status);
  const team = await teamIn(a.guild, url.searchParams.get("id"));
  if (!team) return fail("gone", 404);
  const res = await removeTeam(team.id, a.by, true);
  if (res !== "ok") return fail(res, 404);
  after(async () => { await redrawSides(a.guild, team.tags); });
  return NextResponse.json({ view: await teamsView(a.guild) });
}
