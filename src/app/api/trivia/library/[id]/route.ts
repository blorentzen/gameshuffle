/** PATCH /api/trivia/library/[id] { question?, status? } → edit, approve (status approved) or drop (status retired) a question. */

import { NextResponse } from "next/server";
import { updateQuestion, type QuestionInput } from "@/lib/trivia/store";
import { triviaHost } from "@/lib/trivia/host";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await triviaHost();
  if (!ctx.ok) return ctx.response;
  const body = (await request.json().catch(() => null)) as { question?: QuestionInput; status?: "draft" | "approved" | "retired" } | null;
  const status = body?.status && ["draft", "approved", "retired"].includes(body.status) ? body.status : undefined;
  const r = await updateQuestion(ctx.userId, id, { ...(body?.question ?? ({} as QuestionInput)), ...(status ? { status } : {}) });
  return r.ok ? NextResponse.json({ ok: true, question: r.question }) : NextResponse.json({ ok: false, error: r.error }, { status: r.error === "not_found" ? 404 : 400 });
}
