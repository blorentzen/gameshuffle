/**
 * Trivia leagues for their host.
 *   GET  /api/trivia/leagues → { ready, canStart, leagues } (the signed-in host's)
 *   POST /api/trivia/leagues { title, description?, online, place?, firstAt, timezone?, weeks, teamSize, scoring, bestOf?, template? }
 *        → { league } (refused with circuit_required once Circuit billing is on and the host has no plan)
 */

import { NextResponse } from "next/server";
import { triviaHost } from "@/lib/trivia/host";
import { canStartLeague, createLeague, leaguesReady, listMyLeagues, settingsOf, type CreateLeagueInput } from "@/lib/trivia/leagues";

export const runtime = "nodejs";

const STATUS: Record<string, number> = { circuit_required: 402, not_ready: 503 };

export async function GET() {
  const ctx = await triviaHost();
  if (!ctx.ok) return ctx.response;
  if (!(await leaguesReady())) return NextResponse.json({ ok: true, ready: false, canStart: false, leagues: [] });
  const [leagues, canStart] = await Promise.all([listMyLeagues(ctx.userId), canStartLeague(ctx.userId)]);
  return NextResponse.json({
    ok: true,
    ready: true,
    canStart,
    leagues: leagues.map((l) => ({ id: l.id, slug: l.slug, title: l.title, status: l.status, weeks: settingsOf(l).weeks })),
  });
}

export async function POST(request: Request) {
  const ctx = await triviaHost();
  if (!ctx.ok) return ctx.response;
  const body = (await request.json().catch(() => null)) as Partial<CreateLeagueInput> | null;
  if (!body?.title || !body.firstAt) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const r = await createLeague(ctx.userId, {
    title: String(body.title),
    description: typeof body.description === "string" ? body.description : null,
    online: body.online === true,
    place: typeof body.place === "string" ? body.place : null,
    firstAt: String(body.firstAt),
    timezone: typeof body.timezone === "string" ? body.timezone : null,
    weeks: Number(body.weeks),
    teamSize: Number(body.teamSize),
    scoring: body.scoring === "total" ? "total" : "place",
    bestOf: body.bestOf !== undefined ? Number(body.bestOf) : undefined,
    template: typeof body.template === "string" ? body.template : undefined,
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: STATUS[r.error] ?? 400 });
  return NextResponse.json({ ok: true, league: { id: r.league.id, slug: r.league.slug } });
}
