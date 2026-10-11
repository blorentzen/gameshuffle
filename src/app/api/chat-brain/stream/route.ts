/**
 * /api/chat-brain/stream: the streamer's Chat Brain game on stream (GS Pro).
 *   GET   → { isPro, hasCommunity, hasTwitch, ready, boards, game, survey, surveyBoard } (game = the running or just-finished one;
 *           survey = the open or just-closed survey round; surveyBoard = the latest board a survey made)
 *   POST  → start a game: Chat plays { boards?, seconds?, familySafe? }, or 1v1 / Teams
 *           { mode: "versus" | "teams", sides: [{ name, members }], rounds?, seconds?, familySafe?, chatAdvisor?, chatLastSteal? }
 *   PATCH → host controls on the running game: { action: lock | next | time | accept | reject | end, seconds?, answer? }
 *           1v1 / Teams add: answer { answer, side? } · trust { pick: side | chat } · control { side } · undo
 *   POST { survey: { question? | category?, seconds?, style? } } → open a survey round; games take { fromSurvey: true } to start on its board
 *   PATCH survey_hide { key, hide } · survey_merge { keys } · survey_close (no game needed)
 * Chat has the same controls (!cb start / next / lock / accept / reject / end, and !cb play / trust / control / undo).
 */

import { NextResponse, after } from "next/server";
import { bingoOwner as streamOwner } from "@/lib/bingo/owner";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  StreamGamesNotReady,
  endGame,
  gameView,
  getRunningGame,
  getShowableGame,
  lockWindow,
  nextBoard,
  overrule,
  playableBoards,
  setGuessTime,
  startGame,
  tickGame,
} from "@/lib/chatbrain/streamGame";
import { pickControl, startVersus, submitAnswer, trust, undoLast } from "@/lib/chatbrain/streamVersus";
import { SURVEY_SECONDS, closeWindow, openSurvey, openWindowFor, tickChannel } from "@/lib/chatbrain/stream";
import { hideSurveyGroup, hostSurveyView, latestSurveyBoard, maybeAiPass, mergeSurveyGroups } from "@/lib/chatbrain/survey";
import { listCategories } from "@/lib/chatbrain/store";

export const runtime = "nodejs";

async function broadcasterFor(userId: string): Promise<string | null> {
  const { data } = await createServiceClient().from("twitch_connections").select("twitch_user_id").eq("user_id", userId).maybeSingle();
  return (data?.twitch_user_id as string | null) ?? null;
}

export async function GET() {
  const ctx = await streamOwner();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const hasTwitch = !!(await broadcasterFor(ctx.userId));
  const base = { ok: true, isPro: ctx.isPro, hasCommunity: !!ctx.communityId, hasTwitch };
  if (!ctx.communityId) return NextResponse.json({ ...base, ready: true, boards: { familySafe: 0, all: 0 }, game: null, survey: null, surveyBoard: null });
  const communityId = ctx.communityId;
  try {
    const broadcasterId = await broadcasterFor(ctx.userId);
    if (broadcasterId) await tickChannel(broadcasterId).catch(() => null);
    const [safe, all, showable, survey, surveyBoard, cats] = await Promise.all([
      playableBoards(communityId, true),
      playableBoards(communityId, false),
      getShowableGame(communityId),
      hostSurveyView(communityId).catch(() => null),
      latestSurveyBoard(communityId).catch(() => null),
      listCategories().catch(() => []),
    ]);
    const categories = cats.filter((c) => c.openPrompts > 0).map((c) => ({ slug: c.slug, name: c.name }));
    const game = showable ? await gameView(await tickGame(showable)) : null;
    if (survey?.status === "open") after(() => maybeAiPass(communityId).catch((err) => console.error("[chat-brain/stream] AI pass failed:", err)));
    return NextResponse.json({ ...base, ready: true, boards: { familySafe: safe.length, all: all.length }, game, survey, surveyBoard, categories });
  } catch (err) {
    if (err instanceof StreamGamesNotReady) return NextResponse.json({ ...base, ready: false, boards: { familySafe: 0, all: 0 }, game: null, survey: null, surveyBoard: null });
    throw err;
  }
}

export async function POST(request: Request) {
  const ctx = await streamOwner();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  if (!ctx.isPro) return NextResponse.json({ ok: false, error: "pro_required" }, { status: 403 });
  if (!ctx.communityId) return NextResponse.json({ ok: false, error: "no_community" }, { status: 400 });
  const broadcasterId = await broadcasterFor(ctx.userId);
  if (!broadcasterId) return NextResponse.json({ ok: false, error: "no_twitch" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as {
    boards?: number; seconds?: number; familySafe?: boolean; mode?: string; rounds?: number;
    sides?: { name?: unknown; members?: unknown }[]; chatAdvisor?: boolean; chatLastSteal?: boolean; fromSurvey?: boolean;
    survey?: { question?: unknown; category?: unknown; seconds?: unknown; style?: unknown };
  } | null;
  if (body?.survey) {
    if (await getRunningGame(ctx.communityId)) return NextResponse.json({ ok: false, error: "game_running" }, { status: 400 });
    await tickChannel(broadcasterId).catch(() => null);
    const q = typeof body.survey.question === "string" ? body.survey.question.trim() : "";
    const r = await openSurvey({
      communityId: ctx.communityId, broadcasterId, ownerUserId: ctx.userId, isPro: ctx.isPro,
      question: q || null,
      category: typeof body.survey.category === "string" && body.survey.category !== "any" ? body.survey.category : null,
      seconds: Number(body.survey.seconds) || SURVEY_SECONDS.default,
      style: body.survey.style === "hidden" ? "hidden" : "live",
    });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.error === "not_ready" ? 503 : 400 });
    await announce(broadcasterId, `🧠 Chat Brain survey: ${r.prompt.text}  ▸  answer with !a <your answer>. You have ${r.window.seconds} seconds!${r.prompt.own && r.style === "hidden" ? " Answers stay secret until we play the board." : ""}`);
    return NextResponse.json({ ok: true, survey: await hostSurveyView(ctx.communityId) });
  }
  const first = body?.fromSurvey ? await latestSurveyBoard(ctx.communityId) : null;
  if (body?.fromSurvey && !first) return NextResponse.json({ ok: false, error: "no_survey_board" }, { status: 400 });
  if (body?.mode === "versus" || body?.mode === "teams") {
    const sides = (Array.isArray(body.sides) ? body.sides : []).slice(0, 2).map((s) => ({
      name: typeof s?.name === "string" ? s.name : "",
      members: Array.isArray(s?.members) ? s.members.filter((m): m is string => typeof m === "string").slice(0, 8) : [],
    }));
    const v = await startVersus({
      communityId: ctx.communityId, hostUserId: ctx.userId, broadcasterId, mode: body.mode, sides,
      rounds: Number(body.rounds) || undefined, seconds: Number(body.seconds) || undefined, familySafe: body.familySafe !== false,
      chatAdvisor: body.chatAdvisor === true, chatLastSteal: body.chatLastSteal === true, first,
    });
    if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: v.error === "not_ready" ? 503 : 400 });
    return NextResponse.json({ ok: true, game: await gameView(v.game) });
  }
  const r = await startGame({
    communityId: ctx.communityId, hostUserId: ctx.userId, broadcasterId,
    boards: Number(body?.boards) || undefined, seconds: Number(body?.seconds) || undefined, familySafe: body?.familySafe !== false, first,
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.error === "not_ready" ? 503 : 400 });
  return NextResponse.json({ ok: true, game: await gameView(r.game) });
}

export async function PATCH(request: Request) {
  const ctx = await streamOwner();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  if (!ctx.communityId) return NextResponse.json({ ok: false, error: "no_community" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { action?: string; seconds?: number; answer?: string; side?: number; pick?: string; key?: string; hide?: boolean; keys?: unknown } | null;
  // Survey rounds need no game.
  if (body?.action === "survey_hide" || body?.action === "survey_merge" || body?.action === "survey_close") {
    let r: { ok: true } | { ok: false; error: string };
    if (body.action === "survey_close") {
      const broadcasterId = await broadcasterFor(ctx.userId);
      const open = broadcasterId ? await openWindowFor(broadcasterId, { fresh: true }) : null;
      r = open && !open.gameId ? ((await closeWindow(open.id)) ? { ok: true } : { ok: false, error: "closed" }) : { ok: false, error: "no_survey" };
    } else if (body.action === "survey_hide") {
      r = await hideSurveyGroup(ctx.communityId, { key: String(body.key ?? "") }, body.hide !== false);
    } else {
      const keys = (Array.isArray(body.keys) ? body.keys : []).filter((k): k is string => typeof k === "string").slice(0, 20);
      r = await mergeSurveyGroups(ctx.communityId, keys.map((key) => ({ key })));
    }
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, survey: await hostSurveyView(ctx.communityId) });
  }
  const game = await getRunningGame(ctx.communityId);
  if (!game) return NextResponse.json({ ok: false, error: "no_game" }, { status: 404 });
  const action = body?.action;
  const r = action === "lock" ? await lockWindow(game.id)
    : action === "next" ? await nextBoard(game.id)
    : action === "time" ? await setGuessTime(game.id, Number(body?.seconds))
    : action === "accept" || action === "reject" ? await overrule(game.id, action, body?.answer?.toString().slice(0, 40) || undefined)
    : action === "end" ? await endGame(game.id)
    : action === "answer" ? await submitAnswer(game.id, { text: String(body?.answer ?? "").slice(0, 60), side: Number(body?.side) || undefined })
    : action === "trust" ? await trust(game.id, body?.pick === "chat" ? "chat" : "side")
    : action === "control" ? await pickControl(game.id, Number(body?.side))
    : action === "undo" ? await undoLast(game.id)
    : { ok: false as const, error: "bad_action" };
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  const after = await getShowableGame(ctx.communityId);
  return NextResponse.json({ ok: true, message: r.message ?? null, game: after ? await gameView(after) : null });
}

async function announce(broadcasterId: string, message: string): Promise<void> {
  const botId = process.env.TWITCH_BOT_USER_ID;
  if (!botId) return;
  const { sendChatMessage } = await import("@/lib/twitch/client");
  await sendChatMessage({ broadcasterId, senderId: botId, message: message.slice(0, 480) }).catch((err) => console.error("[chat-brain/stream] survey line failed:", err));
}
