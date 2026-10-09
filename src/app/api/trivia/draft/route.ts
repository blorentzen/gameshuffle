/**
 * POST /api/trivia/draft { theme, count?, difficulty?, familySafe? }
 * Claude drafts trivia questions into the host's library as drafts (GS Pro,
 * counted against the AI allowance). The host approves each one before it
 * can go in a round.
 */

import { NextResponse } from "next/server";
import { aiAccess } from "@/lib/ai/access";
import { recordAiUse } from "@/lib/ai/usage";
import { withAiTokens } from "@/lib/ai/tokens";
import { draftTriviaQuestions } from "@/lib/trivia/drafts";
import { listLibrary, saveQuestion, type LibraryQuestion } from "@/lib/trivia/store";
import { notReadyResponse } from "@/lib/trivia/host";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const access = await aiAccess("trivia");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error, remaining: access.remaining }, { status: access.status });
  const body = (await request.json().catch(() => null)) as { theme?: unknown; count?: unknown; difficulty?: unknown; familySafe?: unknown } | null;
  const theme = typeof body?.theme === "string" ? body.theme.trim().slice(0, 200) : "";
  if (theme.length < 3) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const count = Math.min(10, Math.max(1, Math.round(Number(body?.count) || 8)));
  const difficulty = body?.difficulty === "easy" || body?.difficulty === "medium" || body?.difficulty === "hard" ? body.difficulty : "mixed";
  try {
    const mine = await listLibrary(access.userId);
    const { value: res, tokens } = await withAiTokens(() => draftTriviaQuestions({ theme, count, difficulty, familySafe: body?.familySafe !== false, avoid: mine.map((q) => q.prompt) }));
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.error === "rate_limited" ? 429 : 502 });
    await recordAiUse(access.userId, "trivia", tokens);
    const saved: LibraryQuestion[] = [];
    for (const q of res.data) {
      const r = await saveQuestion(access.userId, q, { origin: "ai", status: "draft" });
      if (r.ok) saved.push(r.question);
    }
    return NextResponse.json({ ok: true, questions: saved, remaining: access.remaining === null ? null : access.remaining - 1 });
  } catch (err) {
    return notReadyResponse(err) ?? NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
