/**
 * GET  /api/trivia/games → the host's trivia nights
 * POST /api/trivia/games { templateId, title } → a new night from a template
 *      { topic } → a night filled with a game's approved questions (the question pages' "Play these")
 */

import { NextResponse } from "next/server";
import { createGame, listGames } from "@/lib/trivia/store";
import { notReadyResponse, triviaHost } from "@/lib/trivia/host";
import { createTopicGame } from "@/lib/trivia/topics";
import { topicBySlug } from "@/data/trivia-seo";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await triviaHost();
  if (!ctx.ok) return ctx.response;
  try {
    const games = await listGames(ctx.userId);
    return NextResponse.json({
      ok: true,
      games: games.map((g) => ({ id: g.id, title: g.title, code: g.code, status: g.status, template: g.template, createdAt: g.created_at, questions: g.rounds.reduce((n, r) => n + r.questions.length, 0) })),
    });
  } catch (err) {
    return notReadyResponse(err) ?? NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const ctx = await triviaHost();
  if (!ctx.ok) return ctx.response;
  const body = (await request.json().catch(() => null)) as { templateId?: string; title?: string; topic?: string } | null;
  try {
    if (body?.topic) {
      const topic = topicBySlug(String(body.topic));
      if (!topic) return NextResponse.json({ ok: false, error: "unknown_topic" }, { status: 400 });
      const t = await createTopicGame(ctx.userId, topic);
      if (!t.ok) return NextResponse.json({ ok: false, error: t.error }, { status: 400 });
      return NextResponse.json({ ok: true, id: t.id });
    }
    const r = await createGame(ctx.userId, { templateId: String(body?.templateId ?? "party"), title: String(body?.title ?? "") });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, id: r.game.id });
  } catch (err) {
    return notReadyResponse(err) ?? NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
