/**
 * GET  /api/trivia/library        → the host's questions (drafts and approved)
 * GET  /api/trivia/library?pack=1 → the GameShuffle pack (staff-verified)
 * POST /api/trivia/library { question } → add a question the host wrote (approved)
 */

import { NextResponse } from "next/server";
import { listLibrary, saveQuestion, type QuestionInput } from "@/lib/trivia/store";
import { notReadyResponse, triviaHost } from "@/lib/trivia/host";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ctx = await triviaHost();
  if (!ctx.ok) return ctx.response;
  try {
    const pack = new URL(request.url).searchParams.get("pack") === "1";
    return NextResponse.json({ ok: true, questions: await listLibrary(ctx.userId, { pack }) });
  } catch (err) {
    return notReadyResponse(err) ?? NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const ctx = await triviaHost();
  if (!ctx.ok) return ctx.response;
  const body = (await request.json().catch(() => null)) as { question?: QuestionInput } | null;
  if (!body?.question) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  try {
    const r = await saveQuestion(ctx.userId, body.question);
    return r.ok ? NextResponse.json({ ok: true, question: r.question }) : NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  } catch (err) {
    return notReadyResponse(err) ?? NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
