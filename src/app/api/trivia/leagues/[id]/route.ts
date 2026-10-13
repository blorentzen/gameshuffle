/**
 * One league, for its host.
 *   GET   /api/trivia/leagues/[id] → the manage view (every week, every team)
 *   PATCH /api/trivia/leagues/[id] { action, … }
 *         start_night → { gameId } (this week's night: built from the league's template, filled from the pack)
 *         undo_night { gameId } · rename { teamId, name } · merge { fromId, intoId } · remove { teamId }
 *         captain { teamId, userId } · settings { title?, description?, weeks?, teamSize?, scoring?, bestOf?, template? }
 *         archive { archived }
 */

import { NextResponse } from "next/server";
import { triviaHost } from "@/lib/trivia/host";
import { archiveLeague, manageView, mergeTeams, removeTeam, renameTeam, setCaptain, startLeagueNight, undoLeagueNight, updateLeague } from "@/lib/trivia/leagues";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await triviaHost();
  if (!ctx.ok) return ctx.response;
  const view = await manageView(ctx.userId, id);
  return view ? NextResponse.json({ ok: true, view }) : NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await triviaHost();
  if (!ctx.ok) return ctx.response;
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  let r: { ok: true; [k: string]: unknown } | { ok: false; error: string };
  switch (b?.action) {
    case "start_night": r = await startLeagueNight(ctx.userId, id); break;
    case "undo_night": r = await undoLeagueNight(ctx.userId, id, str(b.gameId)); break;
    case "rename": r = await renameTeam(ctx.userId, id, str(b.teamId), str(b.name)); break;
    case "merge": r = await mergeTeams(ctx.userId, id, str(b.fromId), str(b.intoId)); break;
    case "remove": r = await removeTeam(ctx.userId, id, str(b.teamId)); break;
    case "captain": r = await setCaptain(ctx.userId, id, str(b.teamId), str(b.userId)); break;
    case "archive": r = await archiveLeague(ctx.userId, id, b.archived === true); break;
    case "settings": {
      const s = (b.settings ?? {}) as Record<string, unknown>;
      const res = await updateLeague(ctx.userId, id, {
        ...(typeof s.title === "string" ? { title: s.title } : {}),
        ...(s.description !== undefined ? { description: typeof s.description === "string" ? s.description : null } : {}),
        ...(s.weeks !== undefined ? { weeks: Number(s.weeks) } : {}),
        ...(s.teamSize !== undefined ? { teamSize: Number(s.teamSize) } : {}),
        ...(s.scoring === "place" || s.scoring === "total" ? { scoring: s.scoring } : {}),
        ...(s.bestOf !== undefined ? { bestOf: Number(s.bestOf) } : {}),
        ...(typeof s.template === "string" ? { template: s.template } : {}),
      });
      r = res.ok ? { ok: true } : res;
      break;
    }
    default: return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  }
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.error === "not_found" ? 404 : 400 });
  return NextResponse.json(r);
}
