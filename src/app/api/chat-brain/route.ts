/**
 * GET /api/chat-brain?category=<slug>&anon=<browser id>
 * The categories page: every category with its open prompt count, the open
 * prompts (in one category, or all), unanswered by this person first, and the
 * seeding progress (answers given, boards ready, launch goal).
 *
 * GET /api/chat-brain?view=card&skip=<id,id>&anon=<browser id>
 * The one-question card (Daily, Weekly, homepage, live nights): the next
 * question this person hasn't answered or skipped, plus progress.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ChatBrainNotReady, brainProgress, listCategories, listOpenPrompts, type AnswerIdentity } from "@/lib/chatbrain/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const category = sp.get("category");
  const anon = sp.get("anon");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const who: AnswerIdentity | null = user ? { userId: user.id } : anon && /^[0-9a-f-]{16,64}$/i.test(anon) ? { anonId: anon } : null;
  const headers = { "Cache-Control": "private, no-store" };
  try {
    if (sp.get("view") === "card") {
      const skip = new Set((sp.get("skip") ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 50));
      const [prompts, progress] = await Promise.all([listOpenPrompts({ category, who, limit: 60 }), brainProgress()]);
      const left = prompts.filter((p) => !p.answered && p.familySafe && !skip.has(p.id));
      const next = left[0] ?? null;
      return NextResponse.json({
        ok: true, ready: true, progress, remaining: left.length,
        prompt: next ? { id: next.id, text: next.text, category: next.category } : null,
      }, { headers });
    }
    const [categories, prompts, progress] = await Promise.all([listCategories(), listOpenPrompts({ category, who, limit: 30 }), brainProgress()]);
    return NextResponse.json({ ok: true, ready: true, progress, categories, prompts: prompts.map(({ id, text, category: c, minAnswers, answers, answered, opensAt }) => ({ id, text, category: c, minAnswers, answers, answered, opensAt })) }, { headers });
  } catch (err) {
    if (err instanceof ChatBrainNotReady) return NextResponse.json({ ok: true, ready: false, categories: [], prompts: [], prompt: null, progress: null });
    throw err;
  }
}
