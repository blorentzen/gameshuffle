/**
 * GET  /api/trivia/games/[id]/live → the host's console view (answers grouped for judging)
 * POST /api/trivia/games/[id]/live { action, teams?, verdict? }
 *      open | lock | reveal | standings | next | end | judge (teamIds = a group's teams, verdict)
 */

import { NextResponse, after } from "next/server";
import { finishGame, hostView, judgeTeams, lockQuestion, nextQuestion, openQuestion, revealQuestion, showStandings, tick } from "@/lib/trivia/store";
import { triviaHost } from "@/lib/trivia/host";
import { announce } from "@/lib/trivia/stream";
import { consoleLeague, recordLeagueNight } from "@/lib/trivia/leagues";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await triviaHost(id);
  if (!ctx.ok) return ctx.response;
  const game = ctx.game!;
  return NextResponse.json({ ok: true, view: await hostView(game), league: game.league_id ? await consoleLeague(game).catch(() => null) : null });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await triviaHost(id);
  if (!ctx.ok) return ctx.response;
  const game = await tick(ctx.game!);
  if (game.status !== "live") return NextResponse.json({ ok: false, error: "not_live" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { action?: string; teamIds?: string[]; verdict?: string } | null;
  let ok = true;
  switch (body?.action) {
    case "open": ok = !!(await openQuestion(game)); break;
    case "lock": ok = !!(await lockQuestion(game)); break;
    case "reveal": ok = !!(await revealQuestion(game)); break;
    case "standings": ok = !!(await showStandings(game)); break;
    case "next": ok = !!(await nextQuestion(game)); break;
    case "end": ok = !!(await finishGame(game)); break;
    case "judge": {
      const verdict = body.verdict === "correct" || body.verdict === "wrong" || body.verdict === "partial" ? body.verdict : null;
      const ids = Array.isArray(body.teamIds) ? body.teamIds.filter((x): x is string => typeof x === "string") : [];
      if (!verdict || ids.length === 0) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
      ok = await judgeTeams(game, ids, verdict);
      break;
    }
    default: return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  }
  if (!ok) return NextResponse.json({ ok: false, error: "not_now" }, { status: 409 });
  const fresh = await triviaHost(id);
  // On stream, chat hears about it (after this responds). "Next" after the last question ends the night.
  const said = body?.action === "open" ? "open" : body?.action === "reveal" ? "reveal"
    : (body?.action === "end" || body?.action === "next") && fresh.ok && fresh.game?.status === "done" ? "end" : null;
  if (said) after(() => announce(id, said).catch((err) => console.error("[trivia/live] announce failed:", err)));
  // A league night that just finished adds its league points before the console reloads.
  if (said === "end" && fresh.ok && fresh.game?.league_id) await recordLeagueNight(id).catch((err) => console.error("[trivia/live] league points failed:", err));
  const league = fresh.ok && fresh.game?.league_id ? await consoleLeague(fresh.game).catch(() => null) : null;
  return NextResponse.json({ ok: true, view: fresh.ok ? await hostView(fresh.game!) : null, league });
}
