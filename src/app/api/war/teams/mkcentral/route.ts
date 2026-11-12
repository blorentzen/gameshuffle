/**
 * A team card's MKCentral link and logo setting on the Teams page (logos + MKCentral picks 2026-11-09, all A; Britton:
 * "as long as we have ways to override as needed"). Same access as /api/war/teams; on the site the person counts as
 * able to manage the server. Every answer that changes something carries the page's fresh view.
 *   GET   ?guild=<id>&q=<tag, name or MKCentral link>&game=<mk8dx|mkworld>   → { hits, byLink }
 *         (MKCentral's public registry; works before wars-m6.sql, since it only reads MKCentral)
 *   POST  { guild, teamId, action: "link", mkcId, game }    links the card (fills only what's blank) → { view, name }
 *   POST  { guild, teamId, action: "unlink" }               → { view }
 *   POST  { guild, teamId, action: "refresh", game }        reads the linked team again → { view, reached }
 *   POST  { guild, teamId, action: "logo", source }         auto | upload | mkcentral → { view }
 *         refused: not_ready (before wars-m6.sql), gone, no_team (MKCentral didn't answer for that team)
 */

import { after, NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { linkMkc, linksReady, refreshMkc, setLogoSource, unlinkMkc } from "@/lib/wars/cardStore";
import { redrawSides } from "@/lib/wars/redraw";
import type { LogoSource } from "@/lib/wars/cards";
import { warGameOr, type WarGame } from "@/lib/wars/rules";
import { searchMkcView, teamIn, teamsAccess, teamsView } from "@/lib/wars/teamAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const gameOf = (v: unknown): WarGame => warGameOr(v, "mk8dx");
const SOURCES: LogoSource[] = ["auto", "upload", "mkcentral"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const a = await teamsAccess(url.searchParams.get("guild"));
  if (!a.ok) return fail(a.error, a.status);
  // Searches as people type: generous, but it still reaches MKCentral, so a cap per account.
  if (!(await rateLimit(`war-mkc-search:${a.m.userId}`, { max: 60, windowMs: 60_000 })).ok) return fail("slow_down", 429);
  const q = String(url.searchParams.get("q") ?? "");
  if (!q.trim()) return NextResponse.json({ hits: [], byLink: false });
  return NextResponse.json(await searchMkcView(q, gameOf(url.searchParams.get("game"))));
}

type Body = { guild?: string; teamId?: string; action?: string; mkcId?: unknown; game?: string; source?: string };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return fail("bad_request", 400);
  const a = await teamsAccess(body.guild);
  if (!a.ok) return fail(a.error, a.status);
  if (!(await linksReady())) return fail("not_ready", 503);
  if (!(await rateLimit(`war-teams:${a.m.userId}`, { max: 120, windowMs: 10 * 60_000 })).ok) return fail("slow_down", 429);
  const team = await teamIn(a.guild, body.teamId);
  if (!team) return fail("gone", 404);

  if (body.action === "logo") {
    const source = SOURCES.find((s) => s === body.source);
    if (!source) return fail("bad_request", 400);
    const res = await setLogoSource(team.id, source, a.by, true);
    if (!res.ok) return fail(res.error, res.error === "not_ready" ? 503 : 404);
    after(async () => { await redrawSides(a.guild, res.team.tags, gameOf(body.game)); });
    return NextResponse.json({ view: await teamsView(a.guild) });
  }

  if (body.action === "link") {
    const id = typeof body.mkcId === "number" ? body.mkcId : Number(String(body.mkcId ?? ""));
    if (!Number.isInteger(id) || id <= 0) return fail("bad_request", 400);
    const res = await linkMkc(team.id, id, gameOf(body.game), a.by, true);
    if (!res.ok) return fail(res.error, res.error === "not_ready" ? 503 : res.error === "no_team" ? 502 : 404);
    after(async () => { await redrawSides(a.guild, res.team.tags, gameOf(body.game)); });
    return NextResponse.json({ view: await teamsView(a.guild), name: res.team.mkcName ?? res.mkc?.name ?? null });
  }

  if (body.action === "unlink") {
    const res = await unlinkMkc(team.id, a.by, true);
    if (!res.ok) return fail(res.error, res.error === "not_ready" ? 503 : 404);
    after(async () => { await redrawSides(a.guild, res.team.tags, gameOf(body.game)); });
    return NextResponse.json({ view: await teamsView(a.guild) });
  }

  if (body.action === "refresh") {
    const res = await refreshMkc(team.id, gameOf(body.game));
    if (!res) return fail("gone", 404);
    after(async () => { await redrawSides(a.guild, res.team.tags, gameOf(body.game)); });
    return NextResponse.json({ view: await teamsView(a.guild), reached: !!res.mkc });
  }

  return fail("bad_request", 400);
}
