/**
 * The room, for phones and the TV (no account needed).
 *   GET  /api/trivia/room/[code]                 → the TV's view (never an answer before its reveal)
 *   GET  /api/trivia/room/[code]?team=&key=      → that team's view
 *   POST /api/trivia/room/[code] { action: "join", name }                         → { teamId, key }
 *        { action: "answer", team, key, raw, confidence?, wager? }
 *        { action: "joker", team, key, round }
 * A team's key is its secret: every phone on the team keeps it.
 */

import { NextResponse } from "next/server";
import { gameByCode, joinTeam, setJoker, submitAnswer, teamFor, teamView, tvView } from "@/lib/trivia/store";
import { notReadyResponse } from "@/lib/trivia/host";

export const runtime = "nodejs";

const ERRORS: Record<string, number> = { not_found: 404, finished: 410, full: 409, name_taken: 409 };

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  try {
    const game = await gameByCode(code);
    if (!game || game.status === "cancelled" || game.status === "draft") return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const url = new URL(request.url);
    const teamId = url.searchParams.get("team");
    const key = url.searchParams.get("key");
    if (teamId && key) {
      const team = await teamFor(game.id, teamId, key);
      if (!team) return NextResponse.json({ ok: false, error: "not_on_team" }, { status: 403 });
      return NextResponse.json({ ok: true, view: await teamView(game, team) });
    }
    return NextResponse.json({ ok: true, view: await tvView(game) });
  } catch (err) {
    return notReadyResponse(err) ?? NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = (await request.json().catch(() => null)) as { action?: string; name?: string; team?: string; key?: string; raw?: string; confidence?: number; wager?: number; round?: number } | null;
  try {
    if (body?.action === "join") {
      const r = await joinTeam(code, String(body.name ?? ""));
      if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: ERRORS[r.error] ?? 400 });
      return NextResponse.json({ ok: true, teamId: r.teamId, key: r.secret, name: r.name });
    }
    const game = await gameByCode(code);
    if (!game || game.status !== "live") return NextResponse.json({ ok: false, error: "not_live" }, { status: 409 });
    const team = await teamFor(game.id, String(body?.team ?? ""), String(body?.key ?? ""));
    if (!team) return NextResponse.json({ ok: false, error: "not_on_team" }, { status: 403 });
    if (body?.action === "answer") {
      const r = await submitAnswer(game, team, { raw: String(body.raw ?? ""), confidence: body.confidence ?? null, wager: body.wager ?? null });
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    }
    if (body?.action === "joker") {
      const r = await setJoker(game, team, Number(body.round));
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  } catch (err) {
    return notReadyResponse(err) ?? NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
