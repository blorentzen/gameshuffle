/**
 * Know the Channel questions for a streamer's breaks (GS Pro). The streamer,
 * or a Full-access mod from their mod page (streamOwnerFor).
 *
 * GET                                  → { ready, questions }
 * POST   { questions: [{prompt, answer, accept?}] } → add (typed ones go straight in)
 * PATCH  { id, prompt?, answer?, accept?, status? } → edit, keep a draft, or retire
 * DELETE { id }                        → remove
 *
 * Rules in src/lib/break/channelQuestions.ts; the game in src/lib/break/games/channel.ts.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import { isProUser } from "@/lib/subscription-server";
import { streamOwnerFor } from "@/lib/mods/acting";
import { addQuestions, ChannelQuestionsNotReady, deleteQuestion, listQuestions, updateQuestion, type QuestionInput } from "@/lib/break/channelQuestions";

export const runtime = "nodejs";

const ERRORS: Record<string, string> = {
  too_short: "Add a question and an answer.",
  too_long: "Questions are up to 160 characters and answers up to 60.",
  blocked: "That has a word we can't show on stream.",
};

async function actor() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { ownerUserId, viaMod } = await streamOwnerFor(user.id);
  const communityId = await resolveCommunityIdForOwner(ownerUserId).catch(() => null);
  return { userId: user.id, ownerUserId, viaMod, communityId };
}

async function guard() {
  const me = await actor();
  if (!me) return { res: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) } as const;
  if (!me.communityId) return { res: NextResponse.json({ error: "no_community" }, { status: 400 }) } as const;
  if (!(await isProUser(me.ownerUserId))) return { res: NextResponse.json({ error: "not_pro" }, { status: 403 }) } as const;
  return { me: me as typeof me & { communityId: string } } as const;
}

function notReady() {
  return NextResponse.json({ ok: true, ready: false, questions: [] }, { status: 200 });
}

export async function GET() {
  const g = await guard();
  if ("res" in g) return g.res;
  try {
    return NextResponse.json({ ok: true, ready: true, questions: await listQuestions(g.me.communityId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    if (err instanceof ChannelQuestionsNotReady) return notReady();
    throw err;
  }
}

export async function POST(request: Request) {
  const g = await guard();
  if ("res" in g) return g.res;
  const body = (await request.json().catch(() => ({}))) as { questions?: unknown; origin?: unknown };
  const items = (Array.isArray(body.questions) ? body.questions : []).slice(0, 20).flatMap((q): QuestionInput[] => {
    const o = q as { prompt?: unknown; answer?: unknown; accept?: unknown };
    if (typeof o.prompt !== "string" || typeof o.answer !== "string") return [];
    return [{ prompt: o.prompt, answer: o.answer, accept: Array.isArray(o.accept) ? o.accept.filter((a): a is string => typeof a === "string") : [] }];
  });
  if (!items.length) return NextResponse.json({ error: "too_short", message: ERRORS.too_short }, { status: 400 });
  // AI drafts are added as drafts (origin "ai"); anything typed goes straight in.
  const origin = body.origin === "ai" ? "ai" : g.me.viaMod ? "mod" : "streamer";
  try {
    const res = await addQuestions(g.me.communityId, g.me.userId, origin, items);
    if (!res.added.length) return NextResponse.json({ error: "not_added", message: items.length === 1 ? "That question couldn't be added. Check its length and words." : "None of those could be added." }, { status: 400 });
    return NextResponse.json({ ok: true, added: res.added, skipped: res.skipped });
  } catch (err) {
    if (err instanceof ChannelQuestionsNotReady) return NextResponse.json({ error: "not_ready" }, { status: 503 });
    throw err;
  }
}

export async function PATCH(request: Request) {
  const g = await guard();
  if ("res" in g) return g.res;
  const body = (await request.json().catch(() => ({}))) as { id?: unknown; prompt?: unknown; answer?: unknown; accept?: unknown; status?: unknown };
  if (typeof body.id !== "string") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const res = await updateQuestion(g.me.communityId, body.id, {
    prompt: typeof body.prompt === "string" ? body.prompt : undefined,
    answer: typeof body.answer === "string" ? body.answer : undefined,
    accept: Array.isArray(body.accept) ? body.accept.filter((a): a is string => typeof a === "string") : undefined,
    status: body.status === "approved" || body.status === "draft" || body.status === "retired" ? body.status : undefined,
  });
  if (!res) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if ("error" in res) return NextResponse.json({ error: res.error, message: ERRORS[res.error] }, { status: 400 });
  return NextResponse.json({ ok: true, question: res });
}

export async function DELETE(request: Request) {
  const g = await guard();
  if ("res" in g) return g.res;
  const body = (await request.json().catch(() => ({}))) as { id?: unknown };
  if (typeof body.id !== "string") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  return (await deleteQuestion(g.me.communityId, body.id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
