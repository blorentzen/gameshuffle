/**
 * GET /api/activity/brain?view=card&skip=<id,id>
 * Chat Brain's one-question card inside the Discord Activity (Bearer session).
 * Same answer as /api/chat-brain?view=card, for the player's Discord identity:
 * the same one the /gs-brain command answers as.
 */

import { NextResponse, type NextRequest } from "next/server";
import { sessionFrom } from "@/lib/activity/session";
import { ChatBrainNotReady, brainProgress, listOpenPrompts } from "@/lib/chatbrain/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const s = sessionFrom(req);
  if (!s) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const skip = new Set((sp.get("skip") ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 50));
  try {
    const [prompts, progress] = await Promise.all([listOpenPrompts({ category: sp.get("category"), who: { identityId: s.iid }, limit: 60 }), brainProgress()]);
    const left = prompts.filter((p) => !p.answered && p.familySafe && !skip.has(p.id));
    const next = left[0] ?? null;
    return NextResponse.json({
      ok: true, ready: true, progress, remaining: left.length,
      prompt: next ? { id: next.id, text: next.text, category: next.category } : null,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    if (err instanceof ChatBrainNotReady) return NextResponse.json({ ok: true, ready: false, prompt: null, progress: null });
    throw err;
  }
}
