/**
 * /api/chat-brain/stream: the streamer's Chat Brain game on stream (GS Pro).
 *   GET   → { isPro, hasCommunity, hasTwitch, ready, boards, game, survey, surveyBoard, prizes } (game = the running or just-finished one;
 *           survey = the open or just-closed survey round; surveyBoard = the latest board a survey made;
 *           prizes = { ready, allowance }: whether games can carry a token prize yet, and the tokens left this month)
 *   POST  → start a game: Chat plays { boards?, seconds?, familySafe?, speed?, prize? } (speed = the speed round), or 1v1 / Teams
 *           { mode: "versus" | "teams", sides: [{ name, members }], rounds?, seconds?, familySafe?, chatAdvisor?, chatLastSteal?, prize? }
 *   PATCH → host controls on the running game: { action: lock | next | time | accept | reject | end, seconds?, answer? }
 *           1v1 / Teams add: answer { answer, side? } · trust { pick: side | chat } · control { side } · undo
 *   POST { survey: { question? | category?, seconds?, style? } } → open a survey round; games take { fromSurvey: true } to start on its board
 *   PATCH survey_hide { key, hide } · survey_merge { keys } · survey_close (no game needed)
 *   Co-stream: GET ?search=<name> → streamers on GameShuffle with Twitch connected; POST { mode: "costream", guest, rounds?,
 *   seconds?, familySafe?, prize? } invites one (the game waits in the lobby); GET adds costream = { lobby, invites, guest };
 *   PATCH costream_start · costream_cancel (host) · costream_respond { gameId, accept } · costream_leave { gameId } (either streamer)
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
import { allowanceLeft, prizeReady } from "@/lib/chatbrain/streamPrize";
import { guestGameFor, invitesFor, inviteCostream, leaveCostream, lobbyView, pickCostreamControl, respondCostream, startCostream } from "@/lib/chatbrain/streamCostream";
import { GAME_COLS, type StreamGameRow } from "@/lib/chatbrain/streamGame";

export const runtime = "nodejs";

async function broadcasterFor(userId: string): Promise<string | null> {
  const { data } = await createServiceClient().from("twitch_connections").select("twitch_user_id").eq("user_id", userId).maybeSingle();
  return (data?.twitch_user_id as string | null) ?? null;
}

/** Streamers someone could invite to a co-stream: GameShuffle accounts with Twitch connected. */
async function searchStreamers(q: string, selfId: string) {
  const like = `%${q.replace(/[%_,()]/g, "")}%`;
  const svc = createServiceClient();
  const { data: users } = await svc.from("users").select("id, username, display_name, avatar_url, twitch_username")
    .or(`username.ilike.${like},display_name.ilike.${like},twitch_username.ilike.${like}`).neq("id", selfId).limit(20);
  const rows = (users ?? []) as { id: string; username: string | null; display_name: string | null; avatar_url: string | null; twitch_username: string | null }[];
  if (!rows.length) return [];
  const { data: conns } = await svc.from("twitch_connections").select("user_id").in("user_id", rows.map((u) => u.id));
  const withTwitch = new Set(((conns ?? []) as { user_id: string }[]).map((c) => c.user_id));
  return rows.filter((u) => withTwitch.has(u.id)).slice(0, 8)
    .map((u) => ({ id: u.id, name: u.display_name || u.twitch_username || u.username || "Streamer", username: u.username, twitch: u.twitch_username, avatar: u.avatar_url }));
}

/** The host's co-stream waiting in the lobby. */
async function hostLobby(communityId: string): Promise<StreamGameRow | null> {
  const { data } = await createServiceClient().from("brain_stream_games").select(GAME_COLS)
    .eq("host_community_id", communityId).eq("mode", "costream").eq("status", "lobby").limit(1).maybeSingle();
  return (data as StreamGameRow | null) ?? null;
}

async function costreamState(communityId: string, userId: string) {
  const [lobby, invites, guest] = await Promise.all([hostLobby(communityId), invitesFor(userId), guestGameFor(communityId)]);
  return {
    lobby: lobby ? { gameId: lobby.id, ...(await lobbyView(lobby)) } : null,
    invites,
    guest: guest ? await gameView(await tickGame(guest)) : null,
  };
}

export async function GET(request: Request) {
  const ctx = await streamOwner();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const q = new URL(request.url).searchParams.get("search")?.trim() ?? "";
  if (q) return NextResponse.json({ ok: true, streamers: q.length >= 2 ? await searchStreamers(q, ctx.userId) : [] });
  const hasTwitch = !!(await broadcasterFor(ctx.userId));
  const base = { ok: true, isPro: ctx.isPro, hasCommunity: !!ctx.communityId, hasTwitch };
  // No channel yet: still show co-stream invites (accepting says what's missing).
  if (!ctx.communityId) {
    const invites = await invitesFor(ctx.userId).catch(() => []);
    return NextResponse.json({ ...base, ready: true, boards: { familySafe: 0, all: 0 }, game: null, survey: null, surveyBoard: null, costream: { lobby: null, invites, guest: null } });
  }
  const communityId = ctx.communityId;
  try {
    const broadcasterId = await broadcasterFor(ctx.userId);
    if (broadcasterId) await tickChannel(broadcasterId).catch(() => null);
    const [safe, all, showable, survey, surveyBoard, cats, prizesOn, allowance, costream] = await Promise.all([
      playableBoards(communityId, true),
      playableBoards(communityId, false),
      getShowableGame(communityId),
      hostSurveyView(communityId).catch(() => null),
      latestSurveyBoard(communityId).catch(() => null),
      listCategories().catch(() => []),
      prizeReady().catch(() => false),
      allowanceLeft(communityId).catch(() => 0),
      costreamState(communityId, ctx.userId).catch(() => ({ lobby: null, invites: [], guest: null })),
    ]);
    const categories = cats.filter((c) => c.openPrompts > 0).map((c) => ({ slug: c.slug, name: c.name }));
    const game = showable ? await gameView(await tickGame(showable)) : null;
    if (survey?.status === "open") after(() => maybeAiPass(communityId).catch((err) => console.error("[chat-brain/stream] AI pass failed:", err)));
    return NextResponse.json({ ...base, ready: true, boards: { familySafe: safe.length, all: all.length }, game, survey, surveyBoard, categories, prizes: { ready: prizesOn, allowance }, costream });
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
    boards?: number; seconds?: number; familySafe?: boolean; mode?: string; rounds?: number; speed?: boolean; prize?: number;
    sides?: { name?: unknown; members?: unknown }[]; chatAdvisor?: boolean; chatLastSteal?: boolean; fromSurvey?: boolean; guest?: unknown;
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
  if (body?.mode === "costream") {
    const guest = typeof body.guest === "string" && /^[0-9a-f-]{36}$/i.test(body.guest) ? body.guest : "";
    if (!guest) return NextResponse.json({ ok: false, error: "no_guest" }, { status: 400 });
    const c = await inviteCostream({
      communityId: ctx.communityId, hostUserId: ctx.userId, broadcasterId, guestUserId: guest,
      rounds: Number(body.rounds) || undefined, seconds: Number(body.seconds) || undefined, familySafe: body.familySafe !== false, prize: Number(body.prize) || 0, first,
    });
    if (!c.ok) return NextResponse.json({ ok: false, error: c.error }, { status: c.error === "not_ready" ? 503 : 400 });
    return NextResponse.json({ ok: true, costream: await costreamState(ctx.communityId, ctx.userId) });
  }
  if (body?.mode === "versus" || body?.mode === "teams") {
    const sides = (Array.isArray(body.sides) ? body.sides : []).slice(0, 2).map((s) => ({
      name: typeof s?.name === "string" ? s.name : "",
      members: Array.isArray(s?.members) ? s.members.filter((m): m is string => typeof m === "string").slice(0, 8) : [],
    }));
    const v = await startVersus({
      communityId: ctx.communityId, hostUserId: ctx.userId, broadcasterId, mode: body.mode, sides,
      rounds: Number(body.rounds) || undefined, seconds: Number(body.seconds) || undefined, familySafe: body.familySafe !== false,
      chatAdvisor: body.chatAdvisor === true, chatLastSteal: body.chatLastSteal === true, first, prize: Number(body.prize) || 0,
    });
    if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: v.error === "not_ready" ? 503 : 400 });
    return NextResponse.json({ ok: true, game: await gameView(v.game) });
  }
  const r = await startGame({
    communityId: ctx.communityId, hostUserId: ctx.userId, broadcasterId,
    boards: Number(body?.boards) || undefined, seconds: Number(body?.seconds) || undefined, familySafe: body?.familySafe !== false, first,
    speed: body?.speed === true || body?.mode === "speed", prize: Number(body?.prize) || 0,
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.error === "not_ready" ? 503 : 400 });
  return NextResponse.json({ ok: true, game: await gameView(r.game) });
}

export async function PATCH(request: Request) {
  const ctx = await streamOwner();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  if (!ctx.communityId) return NextResponse.json({ ok: false, error: "no_community" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { action?: string; seconds?: number; answer?: string; side?: number; pick?: string; key?: string; hide?: boolean; keys?: unknown; gameId?: string; accept?: boolean } | null;
  // Co-stream lobby and guest actions (the guest's own game is the host's, so these come first).
  if (body?.action?.startsWith("costream_")) {
    const lobby = await hostLobby(ctx.communityId);
    const gameId = typeof body.gameId === "string" ? body.gameId : "";
    const r = body.action === "costream_start" ? (lobby ? await startCostream(lobby.id) : { ok: false as const, error: "no_game" })
      : body.action === "costream_cancel" ? (lobby ? await leaveCostream(lobby.id, ctx.userId) : { ok: false as const, error: "no_game" })
      : body.action === "costream_respond" ? await respondCostream(gameId, ctx.userId, body.accept === true)
      : body.action === "costream_leave" ? await leaveCostream(gameId || (await guestGameFor(ctx.communityId, { playingOnly: true }))?.id || "", ctx.userId)
      : { ok: false as const, error: "bad_action" };
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    const showable = await getShowableGame(ctx.communityId);
    return NextResponse.json({ ok: true, game: showable ? await gameView(showable) : null, costream: await costreamState(ctx.communityId, ctx.userId) });
  }
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
    : action === "control" ? game.mode === "costream" ? await pickCostreamControl(game.id, Number(body?.side)) : await pickControl(game.id, Number(body?.side))
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
