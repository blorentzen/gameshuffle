/**
 * Teams entering a league, for players (signed in).
 *   POST   /api/trivia/leagues/[id]/teams { communityId } | { name }  → enter a team (you're its captain)
 *          { action: "tonight", teamId } → tonight's team link (starts the team in tonight's room if needed)
 *   DELETE /api/trivia/leagues/[id]/teams { teamId } → a captain leaving before the team has played
 */

import { NextResponse } from "next/server";
import { triviaHost } from "@/lib/trivia/host";
import { enterTeam, getLeague, leaveLeague } from "@/lib/trivia/leagues";
import { tonightLink } from "@/lib/trivia/join";

export const runtime = "nodejs";

const STATUS: Record<string, number> = { not_found: 404, captains_only: 403, not_your_crew: 403, not_your_team: 403, league_full: 409, name_taken: 409, season_over: 409, has_played: 409, no_night: 409 };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await triviaHost();
  if (!ctx.ok) return ctx.response;
  const league = await getLeague(id);
  if (!league || league.status === "archived") return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const b = (await request.json().catch(() => null)) as { action?: string; teamId?: string; communityId?: string; name?: string } | null;
  if (b?.action === "tonight") {
    const r = await tonightLink(league, ctx.userId, String(b.teamId ?? ""));
    return r.ok ? NextResponse.json(r) : NextResponse.json({ ok: false, error: r.error }, { status: STATUS[r.error] ?? 400 });
  }
  const r = await enterTeam(league, ctx.userId, b?.communityId ? { communityId: String(b.communityId) } : { name: String(b?.name ?? "") });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: STATUS[r.error] ?? 400 });
  return NextResponse.json({ ok: true, teamId: r.team.id, name: r.team.name, crewMade: r.crewMade ?? false });
}

export async function DELETE(request: Request) {
  const ctx = await triviaHost();
  if (!ctx.ok) return ctx.response;
  const b = (await request.json().catch(() => null)) as { teamId?: string } | null;
  const r = await leaveLeague(ctx.userId, String(b?.teamId ?? ""));
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: r.error }, { status: STATUS[r.error] ?? 400 });
}
