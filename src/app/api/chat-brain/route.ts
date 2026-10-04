/**
 * GET /api/chat-brain?category=<slug>&anon=<browser id>
 * The categories page: every category with its open prompt count, and the open
 * prompts (in one category, or all), unanswered by this person first.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ChatBrainNotReady, listCategories, listOpenPrompts, type AnswerIdentity } from "@/lib/chatbrain/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category");
  const anon = req.nextUrl.searchParams.get("anon");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const who: AnswerIdentity | null = user ? { userId: user.id } : anon && /^[0-9a-f-]{16,64}$/i.test(anon) ? { anonId: anon } : null;
  try {
    const [categories, prompts] = await Promise.all([listCategories(), listOpenPrompts({ category, who, limit: 30 })]);
    return NextResponse.json({ ok: true, ready: true, categories, prompts: prompts.map(({ id, text, category: c, minAnswers, answers, answered, opensAt }) => ({ id, text, category: c, minAnswers, answers, answered, opensAt })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    if (err instanceof ChatBrainNotReady) return NextResponse.json({ ok: true, ready: false, categories: [], prompts: [] });
    throw err;
  }
}
