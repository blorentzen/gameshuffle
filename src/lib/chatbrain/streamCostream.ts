import "server-only";

/**
 * Chat Brain on stream: co-stream (specs/gs-originals-chat-brain-stream.md,
 * "Co-stream", build step 4). Two channels' chats, one team each; only the
 * host needs GS Pro.
 *
 *   invite    the host picks a streamer on GameShuffle with Twitch connected.
 *             The game waits in the lobby with the guest's team row holding the
 *             invite (members[0] = { name, userId, state }); the guest gets a
 *             notification and accepts on their Chat Brain tab, which binds their
 *             channel to team 2. The host starts the game.
 *   a round   a face-off window open to both chats at once (each chat's answer
 *             counted on its own; streamRules.costreamFaceoff), then guess
 *             windows for the chat in control until the board is cleared or
 *             three strikes, then one steal window for the other chat. The pot
 *             goes to the round's winner, doubled in the last round.
 *
 * Every window lives on the host's channel; the guest's chat reaches it
 * through its team row (stream.channelWindow) and each guess carries its team.
 * Only the host (and their mods, from the host's chat or dashboard) set the
 * pace; either streamer can leave, which ends the game with the scores as
 * they are. Lines go to both chats. Every viewer in either chat also plays
 * along on their own.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { isBlocked } from "@/lib/moderation/blocks";
import { createNotification } from "@/lib/social/notifications";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import {
  COSTREAM_ROUNDS,
  DEFAULT_GUESS_SECONDS,
  REVEAL_PAUSE_MS,
  STRIKES_PER_BOARD,
  chatAnswer,
  costreamFaceoff,
  costreamQuestionLine,
  costreamTurnLine,
  faceoffLine,
  firstMatchAt,
  isGuessSeconds,
  leaning,
  outcomeFor,
  playAlongAwards,
  roundEndLine,
  roundMultiplier,
  versusFinalLine,
  type BankReason,
  type ChatAnswer,
  type WindowOutcome,
} from "./streamRules";
import { closeWindow, dropWindow, openGuessWindow, type GuessRow, type StreamWindow } from "./stream";
import {
  GAME_COLS,
  addPlayAlong,
  earnedOnBoard,
  gameWindow,
  getRunningGame,
  loadBoard,
  loadGame,
  loadReveals,
  pickBoards,
  say,
  toGuesses,
  topPlayAlong,
  topPlayAlongKeyed,
  withPrizes,
  type ControlResult,
  type StreamBoard,
  type StreamGameRow as GameRow,
  type StreamGameView,
} from "./streamGame";
import { payPrize, setPrize, type PrizePaid } from "./streamPrize";

export const MAX_FACEOFFS = 3;
const HOST = 1;
const GUEST = 2;
const other = (team: number) => (team === HOST ? GUEST : HOST);

type Kind = "faceoff" | "guess" | "steal";

/** What a co-stream window records (brain_stream_windows.answer). */
interface CoMeta {
  costream: true;
  seq?: number;
  attempt?: number;
  /** Each chat's answer and what it scored (face-off: both; otherwise the one in play). */
  chats?: Record<string, ChatAnswer | null>;
  outcomes?: Record<string, WindowOutcome>;
  playalong?: Record<string, number>;
}

type GuestState = "invited" | "joined" | "declined" | "left";
interface Chat { team: number; name: string; score: number; strikes: number; broadcasterId: string | null; communityId: string | null; userId: string | null; state: "host" | GuestState }

type TurnRow = { id: string; kind: Kind; team: number | null; answer: CoMeta | null; result: "hit" | "miss" | "empty" | null; status: "open" | "closing" | "closed"; opens_at: string; closes_at: string; closed_at: string | null; overruled: boolean; board_id: string | null };
const TURN_COLS = "id, kind, team, answer, result, status, opens_at, closes_at, closed_at, overruled, board_id";

export const isCostreamMode = (mode: string) => mode === "costream";

// ─── reads ───────────────────────────────────────────────────────────────────

export async function loadChats(game: Pick<GameRow, "id" | "host_user_id">): Promise<Map<number, Chat>> {
  const { data } = await createServiceClient().from("brain_stream_teams").select("team, name, score, strikes, broadcaster_id, community_id, members").eq("game_id", game.id);
  const out = new Map<number, Chat>();
  for (const r of (data ?? []) as { team: number; name: string; score: number; strikes: number; broadcaster_id: string | null; community_id: string | null; members: { name?: string; userId?: string; state?: GuestState }[] | null }[]) {
    const m = r.members?.[0];
    out.set(r.team, {
      team: r.team, name: r.name, score: r.score, strikes: r.strikes, broadcasterId: r.broadcaster_id, communityId: r.community_id,
      userId: r.team === HOST ? game.host_user_id : m?.userId ?? null, state: r.team === HOST ? "host" : m?.state ?? "invited",
    });
  }
  return out;
}

const nameOf = (chats: Map<number, Chat>, team: number | null) => (team ? chats.get(team)?.name ?? "That chat" : "That chat");

/** Say it in both chats. */
async function sayBoth(chats: Map<number, Chat>, message: string): Promise<void> {
  const channels = [...new Set([chats.get(HOST)?.broadcasterId, chats.get(GUEST)?.state === "joined" ? chats.get(GUEST)?.broadcasterId : null].filter((b): b is string => !!b))];
  await Promise.all(channels.map((b) => say(b, message)));
}

const orderOf = (t: TurnRow) => t.answer?.seq ?? Date.parse(t.opens_at);

async function boardTurns(gameId: string, boardPromptId: string): Promise<TurnRow[]> {
  const { data } = await createServiceClient().from("brain_stream_windows").select(TURN_COLS).eq("game_id", gameId).eq("board_id", boardPromptId);
  return ((data ?? []) as TurnRow[]).filter((t) => !t.overruled).sort((x, y) => orderOf(x) - orderOf(y));
}

const potOf = (reveals: { team: number | null; points: number }[]) => reveals.filter((r) => r.team !== null).reduce((n, r) => n + r.points, 0);
const allFound = (board: StreamBoard, revealed: number[]) => board.answers.every((a) => revealed.includes(a.rank));

/** Display name for an account (their GameShuffle name, else the username). */
async function accountName(userId: string): Promise<string> {
  const { data } = await createServiceClient().from("users").select("display_name, username, twitch_username").eq("id", userId).maybeSingle();
  const r = data as { display_name: string | null; username: string | null; twitch_username: string | null } | null;
  return (r?.display_name || r?.twitch_username || r?.username || "Streamer").slice(0, 24);
}

async function twitchIdOf(userId: string): Promise<string | null> {
  const { data } = await createServiceClient().from("twitch_connections").select("twitch_user_id").eq("user_id", userId).maybeSingle();
  return (data as { twitch_user_id: string | null } | null)?.twitch_user_id ?? null;
}

/** Whether our bot reads this streamer's chat (their chat-message subscription is live). */
async function botInChat(userId: string): Promise<boolean> {
  const { data } = await createServiceClient().from("twitch_eventsub_subscriptions").select("status")
    .eq("user_id", userId).eq("type", "channel.chat.message").limit(5);
  return ((data ?? []) as { status: string }[]).some((r) => r.status === "enabled");
}

/** The co-stream this community's streamer is the guest in: playing, or just finished (worth showing). */
export async function guestGameFor(communityId: string, opts: { playingOnly?: boolean } = {}): Promise<GameRow | null> {
  const { data, error } = await createServiceClient().from("brain_stream_teams").select("game_id, joined_at")
    .eq("community_id", communityId).eq("team", GUEST).order("joined_at", { ascending: false }).limit(3);
  if (error) return null;
  for (const r of (data ?? []) as { game_id: string }[]) {
    const g = await loadGame(r.game_id);
    if (!g || g.mode !== "costream") continue;
    if (g.status === "playing") return g;
    if (!opts.playingOnly && g.status === "done" && g.finished_at && Date.now() - Date.parse(g.finished_at) < 2 * 60_000) return g;
  }
  return null;
}

/** Whether this community's channel is busy in a co-stream (as host or guest), so it can't start anything else. */
export async function inCostream(communityId: string): Promise<boolean> {
  if (await guestGameFor(communityId, { playingOnly: true })) return true;
  const { data } = await createServiceClient().from("brain_stream_games").select("id").eq("host_community_id", communityId).eq("mode", "costream").in("status", ["lobby", "playing"]).limit(1);
  return (data ?? []).length > 0;
}

// ─── inviting ────────────────────────────────────────────────────────────────

export type InviteError = "game_running" | "window_open" | "no_boards" | "not_ready" | "failed" | "self" | "no_guest" | "guest_no_twitch" | "blocked" | "guest_busy";

/** The host invites another streamer: the game waits in the lobby until they accept. */
export async function inviteCostream(input: {
  communityId: string; hostUserId: string; broadcasterId: string; guestUserId: string;
  rounds?: number; seconds?: number; familySafe?: boolean; prize?: number; first?: { id: string; promptId: string } | null;
}): Promise<{ ok: true; game: GameRow } | { ok: false; error: InviteError }> {
  const svc = createServiceClient();
  if (input.guestUserId === input.hostUserId) return { ok: false, error: "self" };
  const { data: guest } = await svc.from("users").select("id").eq("id", input.guestUserId).maybeSingle();
  if (!guest) return { ok: false, error: "no_guest" };
  if (!(await twitchIdOf(input.guestUserId))) return { ok: false, error: "guest_no_twitch" };
  if (await isBlocked(input.hostUserId, input.guestUserId)) return { ok: false, error: "blocked" };
  if (await getRunningGame(input.communityId) || await inCostream(input.communityId)) return { ok: false, error: "game_running" };
  const guestCommunity = await resolveCommunityIdForOwner(input.guestUserId);
  if (guestCommunity && (await getRunningGame(guestCommunity) || await inCostream(guestCommunity))) return { ok: false, error: "guest_busy" };

  const count = Math.min(COSTREAM_ROUNDS.max, Math.max(COSTREAM_ROUNDS.min, Math.round(input.rounds ?? COSTREAM_ROUNDS.default)));
  const seconds = isGuessSeconds(input.seconds ?? 0) ? input.seconds! : DEFAULT_GUESS_SECONDS;
  const familySafe = input.familySafe ?? true;
  const picks = await pickBoards(input.communityId, familySafe, count, input.first);
  if (picks === "not_ready") return { ok: false, error: "not_ready" };
  if (picks.length < COSTREAM_ROUNDS.min) return { ok: false, error: "no_boards" };

  const { data: row, error } = await svc.from("brain_stream_games").insert({
    host_community_id: input.communityId, host_user_id: input.hostUserId, mode: "costream",
    board_ids: picks.map((p) => p.id), current_board: 0, rounds: picks.length, window_seconds: seconds,
    family_safe: familySafe, status: "lobby", round: 0, control_team: null,
  }).select(GAME_COLS).single();
  if (error?.code === "23505") return { ok: false, error: "game_running" };
  if (error || !row) return { ok: false, error: error?.code === "42P01" ? "not_ready" : "failed" };
  const game = row as GameRow;
  const [hostName, guestName] = await Promise.all([accountName(input.hostUserId), accountName(input.guestUserId)]);
  // Same keys on every row: a bulk insert sends missing keys as null, not the column default.
  const { error: teamErr } = await svc.from("brain_stream_teams").insert([
    { game_id: game.id, team: HOST, kind: "chat", community_id: input.communityId, broadcaster_id: input.broadcasterId, name: hostName, members: [] },
    { game_id: game.id, team: GUEST, kind: "chat", community_id: guestCommunity, broadcaster_id: null, name: guestName, members: [{ name: guestName, userId: input.guestUserId, state: "invited" }] },
  ]);
  if (teamErr) {
    console.error("[chatbrain/costream] teams not saved:", teamErr);
    await svc.from("brain_stream_games").update({ status: "cancelled", finished_at: new Date().toISOString() }).eq("id", game.id);
    return { ok: false, error: "failed" };
  }
  await setPrize(game.id, input.prize);
  await createNotification({
    userId: input.guestUserId, type: "chatbrain_costream", actorUserId: input.hostUserId,
    title: `${hostName} invited you to a Chat Brain co-stream: your chat against theirs`,
    message: `${picks.length} rounds. Accept on your Chat Brain tab.`,
    link: "/account/streaming?tab=chat-brain", data: { gameId: game.id },
  }).catch((err) => console.error("[chatbrain/costream] invite notice failed:", err));
  return { ok: true, game };
}

export interface CostreamInvite { gameId: string; host: string; rounds: number; seconds: number; invitedAt: string }

/** Invites waiting for this streamer. */
export async function invitesFor(guestUserId: string): Promise<CostreamInvite[]> {
  const { data, error } = await createServiceClient().from("brain_stream_teams")
    .select("game_id, joined_at, brain_stream_games!inner(status, host_user_id, board_ids, window_seconds)")
    .eq("team", GUEST).eq("brain_stream_games.status", "lobby").contains("members", JSON.stringify([{ userId: guestUserId, state: "invited" }])).limit(5);
  if (error) return [];
  const rows = (data ?? []) as unknown as { game_id: string; joined_at: string; brain_stream_games: { host_user_id: string; board_ids: string[]; window_seconds: number } | { host_user_id: string; board_ids: string[]; window_seconds: number }[] }[];
  return Promise.all(rows.map(async (r) => {
    const g = Array.isArray(r.brain_stream_games) ? r.brain_stream_games[0] : r.brain_stream_games;
    return { gameId: r.game_id, host: await accountName(g.host_user_id), rounds: g.board_ids.length, seconds: g.window_seconds, invitedAt: r.joined_at };
  }));
}

export type RespondError = "not_found" | "no_twitch" | "no_bot" | "busy" | "failed";

/** The guest accepts (their channel joins as team 2) or declines. */
export async function respondCostream(gameId: string, guestUserId: string, accept: boolean): Promise<{ ok: true } | { ok: false; error: RespondError }> {
  const svc = createServiceClient();
  const game = await loadGame(gameId);
  if (!game || game.mode !== "costream" || game.status !== "lobby") return { ok: false, error: "not_found" };
  const chats = await loadChats(game);
  const guest = chats.get(GUEST);
  if (!guest || guest.userId !== guestUserId || guest.state !== "invited") return { ok: false, error: "not_found" };
  const guestName = guest.name;
  if (!accept) {
    await svc.from("brain_stream_teams").update({ members: [{ name: guestName, userId: guestUserId, state: "declined" }] }).eq("game_id", gameId).eq("team", GUEST);
    await createNotification({ userId: game.host_user_id, type: "system", actorUserId: guestUserId, title: `${guestName} can't play your Chat Brain co-stream this time`, link: "/account/streaming?tab=chat-brain" }).catch(() => undefined);
    return { ok: true };
  }
  const broadcasterId = await twitchIdOf(guestUserId);
  if (!broadcasterId) return { ok: false, error: "no_twitch" };
  if (!(await botInChat(guestUserId))) return { ok: false, error: "no_bot" };
  const communityId = guest.communityId ?? (await resolveCommunityIdForOwner(guestUserId));
  if (communityId && (await getRunningGame(communityId))) return { ok: false, error: "busy" };
  const { data: joined } = await svc.from("brain_stream_teams").update({
    broadcaster_id: broadcasterId, community_id: communityId, joined_at: new Date().toISOString(),
    members: [{ name: guestName, userId: guestUserId, state: "joined" }],
  }).eq("game_id", gameId).eq("team", GUEST).contains("members", JSON.stringify([{ state: "invited" }])).select("team").maybeSingle();
  if (!joined) return { ok: false, error: "not_found" };
  await createNotification({ userId: game.host_user_id, type: "system", actorUserId: guestUserId, title: `${guestName} joined your Chat Brain co-stream. Start it when you're both ready.`, link: "/account/streaming?tab=chat-brain" }).catch(() => undefined);
  return { ok: true };
}

// ─── playing ─────────────────────────────────────────────────────────────────

async function openTurn(game: GameRow, board: StreamBoard, chats: Map<number, Chat>, kind: Kind, team: number | null, meta: Omit<CoMeta, "costream">, delayMs = REVEAL_PAUSE_MS): Promise<void> {
  const host = chats.get(HOST)?.broadcasterId;
  if (!host) return;
  const w = await openGuessWindow({
    gameId: game.id, communityId: game.host_community_id, broadcasterId: host, boardId: board.promptId,
    team, seconds: game.window_seconds, delayMs, kind, meta: { ...meta, costream: true, seq: Date.now() } as Record<string, unknown>,
  });
  if (!w) console.error("[chatbrain/costream] window not opened", { game: game.id, kind });
}

async function startRound(game: GameRow, board: StreamBoard, index: number, chats: Map<number, Chat>): Promise<void> {
  await openTurn(game, board, chats, "faceoff", null, { attempt: 1 });
  await sayBoth(chats, costreamQuestionLine({
    round: index, rounds: game.board_ids.length, question: board.question,
    sides: [nameOf(chats, HOST), nameOf(chats, GUEST)], double: roundMultiplier(index, game.board_ids.length) > 1,
  }));
}

/** The host starts the game once the guest has joined. */
export async function startCostream(gameId: string): Promise<ControlResult> {
  const game = await loadGame(gameId);
  if (!game || game.mode !== "costream" || game.status !== "lobby") return { ok: false, error: "no_game" };
  const chats = await loadChats(game);
  if (chats.get(GUEST)?.state !== "joined") return { ok: false, error: "guest_not_joined" };
  const { data: started } = await createServiceClient().from("brain_stream_games").update({ status: "playing" })
    .eq("id", gameId).eq("status", "lobby").select(GAME_COLS).maybeSingle();
  if (!started) return { ok: false, error: "busy" };
  const board = await loadBoard(game.board_ids[0]);
  if (!board) return { ok: false, error: "failed" };
  await startRound(started as GameRow, board, 0, chats);
  return { ok: true };
}

/** Score a co-stream window that stream.closeWindow has claimed. */
export async function closeCostreamWindow(window: StreamWindow, rows: GuessRow[], game: GameRow): Promise<void> {
  const svc = createServiceClient();
  const finish = (patch: Record<string, unknown>) =>
    svc.from("brain_stream_windows").update({ status: "closed", closed_at: new Date().toISOString(), guesses: rows.length, ...patch }).eq("id", window.id);
  const board = await loadBoard(game.board_ids[game.current_board]);
  if (!board || game.status !== "playing" || window.boardId !== board.promptId) { await finish({}); return; }
  const chats = await loadChats(game);
  const { data: cur } = await svc.from("brain_stream_windows").select("answer").eq("id", window.id).maybeSingle();
  const meta: CoMeta = { ...((cur as { answer: CoMeta | null } | null)?.answer ?? { costream: true }), costream: true };

  const reveals = await loadReveals(game.id, board.id);
  const revealed = reveals.map((r) => r.rank);
  const all = toGuesses(rows);
  const hidden = board.answers.filter((b) => !revealed.includes(b.rank)).map((b) => b.rank);
  const awards = playAlongAwards(all, board.answers, hidden, await earnedOnBoard(game.id, board.promptId, window.id));
  await addPlayAlong(game.id, awards, window.id);
  meta.playalong = Object.fromEntries([...awards].map(([k, a]) => [k, a.rank]));
  const teamGuesses = (team: number) => toGuesses(rows.filter((r) => r.team === team));
  const reveal = (team: number, rank: number, points: number) =>
    svc.from("brain_stream_reveals").upsert({ game_id: game.id, board_id: board.id, rank, team, points, window_id: window.id }, { onConflict: "game_id,board_id,rank", ignoreDuplicates: true });

  if (window.kind === "faceoff") {
    const sides = [HOST, GUEST].map((team) => {
      const guesses = teamGuesses(team);
      const answer = chatAnswer(guesses, board.answers);
      const outcome = outcomeFor(answer, board.answers, revealed);
      return { team, answer, outcome, firstAt: outcome.result === "hit" ? firstMatchAt(guesses, board.answers, outcome.rank) : null };
    });
    const result = costreamFaceoff(sides[0], sides[1]);
    meta.chats = { [HOST]: sides[0].answer, [GUEST]: sides[1].answer };
    meta.outcomes = { [HOST]: sides[0].outcome, [GUEST]: sides[1].outcome };
    const attempt = meta.attempt ?? 1;
    await finish({ result: result.result === "won" ? "hit" : sides.every((x) => x.outcome.result === "empty") ? "empty" : "miss", answer: meta });
    await sayBoth(chats, faceoffLine({
      sides: [nameOf(chats, HOST), nameOf(chats, GUEST)], outcomes: [sides[0].outcome, sides[1].outcome], result,
      winnerName: result.result === "won" ? nameOf(chats, result.winner) : null, attempt, maxAttempts: MAX_FACEOFFS,
    }));
    if (result.result === "again") {
      if (attempt < MAX_FACEOFFS) await openTurn(game, board, chats, "faceoff", null, { attempt: attempt + 1 });
      return; // after the last try the host picks (pickControl)
    }
    for (const r of result.reveals) await reveal(r.team, r.rank, r.points);
    await takeControl(game, board, chats, result.winner, [...revealed, ...result.reveals.map((r) => r.rank)]);
    return;
  }

  const team = window.team ?? game.control_team ?? HOST;
  const answer = chatAnswer(teamGuesses(team), board.answers);
  const outcome = outcomeFor(answer, board.answers, revealed);
  meta.chats = { [team]: answer };
  meta.outcomes = { [team]: outcome };
  await finish({ result: outcome.result, answer: meta });
  if (outcome.result === "hit") await reveal(team, outcome.rank, outcome.points);
  const nowRevealed = outcome.result === "hit" ? [...revealed, outcome.rank] : revealed;

  if (window.kind === "steal") {
    await sayBoth(chats, costreamTurnLine({ who: nameOf(chats, team), outcome, strikes: 0, next: "cleared", other: nameOf(chats, other(team)) }).replace(" Board cleared!", outcome.result === "hit" ? " Stolen!" : " The steal misses."));
    await bankRound(game, board, outcome.result === "hit" ? team : other(team), outcome.result === "hit" ? "stole" : "held");
    return;
  }
  // A guess by the chat in control.
  if (outcome.result === "hit") {
    if (allFound(board, nowRevealed)) {
      await sayBoth(chats, costreamTurnLine({ who: nameOf(chats, team), outcome, strikes: 0, next: "cleared", other: nameOf(chats, other(team)) }));
      await bankRound(game, board, team, "cleared");
      return;
    }
    await sayBoth(chats, costreamTurnLine({ who: nameOf(chats, team), outcome, strikes: chats.get(team)?.strikes ?? 0, next: "guess", other: nameOf(chats, other(team)) }));
    await openTurn(game, board, chats, "guess", team, {});
    return;
  }
  const strikes = (chats.get(team)?.strikes ?? 0) + 1;
  await svc.from("brain_stream_teams").update({ strikes }).eq("game_id", game.id).eq("team", team);
  const steal = strikes >= STRIKES_PER_BOARD;
  await sayBoth(chats, costreamTurnLine({ who: nameOf(chats, team), outcome, strikes, next: steal ? "steal" : "guess", other: nameOf(chats, other(team)) }));
  await openTurn(game, board, chats, steal ? "steal" : "guess", steal ? other(team) : team, {});
}

/** A chat wins control (the face-off, or the host's pick): strikes reset and its first guess opens. */
async function takeControl(game: GameRow, board: StreamBoard, chats: Map<number, Chat>, team: number, revealed: number[]): Promise<void> {
  const svc = createServiceClient();
  await svc.from("brain_stream_games").update({ control_team: team }).eq("id", game.id);
  await svc.from("brain_stream_teams").update({ strikes: 0 }).eq("game_id", game.id);
  for (const c of chats.values()) c.strikes = 0;
  if (allFound(board, revealed)) { await bankRound({ ...game, control_team: team }, board, team, "cleared"); return; }
  await openTurn({ ...game, control_team: team }, board, chats, "guess", team, {});
}

/** After three face-offs with no hit, the host picks who plays. */
export async function pickCostreamControl(gameId: string, team: number): Promise<ControlResult> {
  const game = await loadGame(gameId);
  if (!game || game.status !== "playing" || game.mode !== "costream") return { ok: false, error: "no_game" };
  if (team !== HOST && team !== GUEST) return { ok: false, error: "pick_side" };
  if (game.round > game.current_board) return { ok: false, error: "round_over" };
  if (game.control_team) return { ok: false, error: "has_control" };
  if (await gameWindow(game.id)) return { ok: false, error: "busy" };
  const board = await loadBoard(game.board_ids[game.current_board]);
  if (!board) return { ok: false, error: "failed" };
  const chats = await loadChats(game);
  await sayBoth(chats, `🧠 The host gives control to ${nameOf(chats, team)}: !a to play!`);
  await takeControl(game, board, chats, team, (await loadReveals(game.id, board.id)).map((r) => r.rank));
  return { ok: true };
}

/** Bank the round's pot for the winner (once), reveal the rest, end the game after the last round. */
async function bankRound(game: GameRow, board: StreamBoard, winner: number | null, reason: BankReason): Promise<void> {
  const svc = createServiceClient();
  const { data: claimed } = await svc.from("brain_stream_games").update({ round: game.current_board + 1 })
    .eq("id", game.id).eq("status", "playing").lte("round", game.current_board).select(GAME_COLS).maybeSingle();
  if (!claimed) return;
  const reveals = await loadReveals(game.id, board.id);
  const mult = roundMultiplier(game.current_board, game.board_ids.length);
  const points = reason === "skipped" ? 0 : potOf(reveals) * mult;
  const chats = await loadChats(game);
  if (winner && points > 0) {
    const c = chats.get(winner);
    if (c) { c.score += points; await svc.from("brain_stream_teams").update({ score: c.score }).eq("game_id", game.id).eq("team", winner); }
  }
  const found = new Set(reveals.map((r) => r.rank));
  const rest = board.answers.filter((a) => !found.has(a.rank));
  if (rest.length) {
    await svc.from("brain_stream_reveals").upsert(rest.map((a) => ({ game_id: game.id, board_id: board.id, rank: a.rank, team: null, points: 0 })), { onConflict: "game_id,board_id,rank", ignoreDuplicates: true });
  }
  const last = game.current_board >= game.board_ids.length - 1;
  await sayBoth(chats, roundEndLine({
    winner: winner ? nameOf(chats, winner) : null, reason, points, double: mult > 1, rest,
    scores: [HOST, GUEST].map((t) => ({ name: nameOf(chats, t), score: chats.get(t)?.score ?? 0 })), advice: [], last,
  }));
  if (last) await finishCostream(claimed as GameRow);
}

/** End the game with the scores as they are: winner in both chats, prize paid. */
export async function finishCostream(game: GameRow, opts: { leftBy?: string } = {}): Promise<void> {
  const svc = createServiceClient();
  // A game that never started is cancelled (so it never shows as finished on an overlay).
  const { data } = await svc.from("brain_stream_games").update({ status: game.status === "lobby" ? "cancelled" : "done", finished_at: new Date().toISOString() })
    .eq("id", game.id).eq("status", game.status).select("id").maybeSingle();
  if (!data) return;
  const w = await gameWindow(game.id);
  if (w?.status === "open") await dropWindow(w.id, w.broadcasterId);
  if (game.status === "lobby") return; // never started: nothing to announce
  const chats = await loadChats(game);
  const paid = await payPrize(game).catch((err) => { console.error("[chatbrain/costream] prize not paid:", err); return [] as PrizePaid[]; });
  const line = versusFinalLine({
    sides: [HOST, GUEST].map((t) => ({ name: nameOf(chats, t), score: chats.get(t)?.score ?? 0 })),
    chatScore: 0, chatRight: { right: 0, asked: 0 }, top: withPrizes(await topPlayAlongKeyed(game.id, 3), paid),
  });
  await sayBoth(chats, opts.leftBy ? `🧠 ${opts.leftBy} left the co-stream. ${line.replace(/^🧠 /, "")}`.slice(0, 480) : line);
}

/** The next round: skips the one in play (nobody banks it) or finishes after the last. */
export async function nextCostreamRound(game: GameRow): Promise<ControlResult> {
  const svc = createServiceClient();
  const board = await loadBoard(game.board_ids[game.current_board]);
  if (!board) return { ok: false, error: "failed" };
  const w = await gameWindow(game.id);
  if (w?.status === "closing") return { ok: false, error: "busy" };
  if (w?.status === "open") await dropWindow(w.id, w.broadcasterId);
  if (game.round <= game.current_board) await bankRound(game, board, null, "skipped");
  if (game.current_board >= game.board_ids.length - 1) {
    const g = await loadGame(game.id);
    if (g?.status === "playing") await finishCostream(g);
    return { ok: true, message: "Game over." };
  }
  const nextIndex = game.current_board + 1;
  const { data: moved } = await svc.from("brain_stream_games").update({ current_board: nextIndex, control_team: null })
    .eq("id", game.id).eq("current_board", game.current_board).select(GAME_COLS).maybeSingle();
  if (!moved) return { ok: false, error: "busy" };
  await svc.from("brain_stream_teams").update({ strikes: 0 }).eq("game_id", game.id);
  const nb = await loadBoard(game.board_ids[nextIndex]);
  if (!nb) return { ok: false, error: "failed" };
  await startRound(moved as GameRow, nb, nextIndex, await loadChats(game));
  return { ok: true };
}

/** Either streamer leaves: the game ends with the scores as they are (the host ending it from the dashboard does the same). */
export async function leaveCostream(gameId: string, userId: string): Promise<ControlResult> {
  const game = await loadGame(gameId);
  if (!game || game.mode !== "costream" || (game.status !== "playing" && game.status !== "lobby")) return { ok: false, error: "no_game" };
  const chats = await loadChats(game);
  const guest = chats.get(GUEST);
  const isHost = userId === game.host_user_id;
  if (!isHost && guest?.userId !== userId) return { ok: false, error: "no_game" };
  if (!isHost && guest) await createServiceClient().from("brain_stream_teams").update({ members: [{ name: guest.name, userId, state: "left" }] }).eq("game_id", gameId).eq("team", GUEST);
  await finishCostream(game, { leftBy: isHost ? nameOf(chats, HOST) : guest?.name });
  if (!isHost) await createNotification({ userId: game.host_user_id, type: "system", actorUserId: userId, title: `${guest?.name ?? "Your guest"} left your Chat Brain co-stream`, link: "/account/streaming?tab=chat-brain" }).catch(() => undefined);
  return { ok: true };
}

// ─── views ───────────────────────────────────────────────────────────────────

export interface CostreamLobby { guest: { name: string; state: GuestState } | null; rounds: number; seconds: number }

/** The lobby, for the host's dashboard. */
export async function lobbyView(game: GameRow): Promise<CostreamLobby> {
  const guest = (await loadChats(game)).get(GUEST);
  return { guest: guest ? { name: guest.name, state: guest.state as GuestState } : null, rounds: game.board_ids.length, seconds: game.window_seconds };
}

const leanCache = new Map<string, { at: number; value: { leaning: StreamGameView["leaning"]; guesses: number } }>();

async function windowLean(windowId: string, board: StreamBoard, withLeaning: boolean): Promise<{ leaning: StreamGameView["leaning"]; guesses: number }> {
  const hit = leanCache.get(windowId);
  if (hit && Date.now() - hit.at < 1000) return hit.value;
  const svc = createServiceClient();
  let value: { leaning: StreamGameView["leaning"]; guesses: number };
  if (withLeaning) {
    const { data } = await svc.from("brain_stream_guesses").select("platform, viewer, name, raw, normalized, created_at").eq("window_id", windowId).limit(20_000);
    const guesses = toGuesses((data ?? []) as GuessRow[]);
    value = { leaning: leaning(guesses, board.answers).map((l) => ({ label: l.label, share: l.share })), guesses: guesses.length };
  } else {
    const { count } = await svc.from("brain_stream_guesses").select("viewer", { count: "exact", head: true }).eq("window_id", windowId);
    value = { leaning: [], guesses: count ?? 0 };
  }
  leanCache.set(windowId, { at: Date.now(), value });
  if (leanCache.size > 200) leanCache.delete(leanCache.keys().next().value!);
  return value;
}

/**
 * A co-stream as the overlay, the live page and both dashboards see it. It
 * reuses the 1v1 shape (`versus`): two sides (the chats), who's in control,
 * the turn, the last result. Leaning shows only for a control or steal window
 * (one chat guessing); a face-off's answers stay hidden from the other chat.
 */
export async function costreamView(game: GameRow): Promise<Omit<StreamGameView, "prize"> | null> {
  const index = Math.min(game.current_board, game.board_ids.length - 1);
  const [board, chats] = await Promise.all([loadBoard(game.board_ids[index]), loadChats(game)]);
  if (!board) return null;
  const [reveals, turns, playalong] = await Promise.all([loadReveals(game.id, board.id), boardTurns(game.id, board.promptId), topPlayAlong(game.id)]);
  const byRank = new Map(reveals.map((r) => [r.rank, r]));
  const now = Date.now();
  const open = turns.find((t) => t.status === "open" || t.status === "closing") ?? null;
  const lastClosed = [...turns].reverse().find((t) => t.status === "closed" && t.result !== null) ?? null;
  const playing = game.status === "playing";
  const banked = game.round > game.current_board;
  const phase: import("./streamVersus").VersusView["phase"] = !playing ? "done"
    : banked ? "round_done"
    : open ? (open.kind === "faceoff" ? "faceoff" : open.kind === "steal" ? "steal" : "control")
    : game.control_team ? "control" : "pick_control";
  const lean = open ? await windowLean(open.id, board, open.kind !== "faceoff" && Date.parse(open.opens_at) <= now) : { leaning: [], guesses: 0 };
  const s1 = chats.get(HOST)?.score ?? 0;
  const s2 = chats.get(GUEST)?.score ?? 0;
  // A face-off's last answer is the one that won control (the higher hit), else the first chat's.
  const outs = lastClosed?.answer?.outcomes ?? null;
  const faceoffWinner = outs && lastClosed?.kind === "faceoff"
    ? [HOST, GUEST].filter((t) => outs[String(t)]?.result === "hit").sort((x, y) => {
        const ox = outs[String(x)]; const oy = outs[String(y)];
        return (ox.result === "hit" ? ox.rank : 99) - (oy.result === "hit" ? oy.rank : 99);
      })[0] ?? HOST
    : null;
  const lastTeam = lastClosed ? (lastClosed.team ?? faceoffWinner) : null;
  const lastOutcome = outs && lastTeam ? outs[String(lastTeam)] ?? null : null;
  return {
    id: game.id,
    mode: "costream",
    status: game.status,
    boardIndex: index,
    boardCount: game.board_ids.length,
    question: board.question,
    slots: board.answers.map((a) => {
      const r = byRank.get(a.rank);
      return { rank: a.rank, label: r ? a.label : null, points: r ? a.points : null, found: !!r && r.team !== null, by: r?.team ?? null };
    }),
    strikes: game.control_team ? chats.get(game.control_team)?.strikes ?? 0 : 0,
    score: 0,
    seconds: game.window_seconds,
    phase: !playing ? "done" : open ? (Date.parse(open.opens_at) > now ? "pause" : "guessing") : "board_done",
    window: open ? { opensAt: open.opens_at, closesAt: open.closes_at, guesses: lean.guesses } : null,
    last: null,
    leaning: lean.leaning,
    playalong,
    canOverrule: false,
    familySafe: game.family_safe,
    versus: {
      round: index,
      rounds: game.board_ids.length,
      double: roundMultiplier(index, game.board_ids.length) > 1,
      sides: [HOST, GUEST].map((t) => ({ team: t, name: nameOf(chats, t), score: chats.get(t)?.score ?? 0, strikes: chats.get(t)?.strikes ?? 0, members: [], inControl: game.control_team === t })),
      chat: { score: 0, advisor: false, lastSteal: false },
      phase,
      pot: potOf(reveals.filter((r) => r.team !== null)),
      faceoff: [nameOf(chats, HOST), nameOf(chats, GUEST)],
      turn: open ? {
        kind: open.kind, team: open.team, side: open.team ? nameOf(chats, open.team) : null, player: null, pair: null, attempt: open.answer?.attempt ?? null,
        state: Date.parse(open.opens_at) > now ? "pause" : "open", opensAt: open.opens_at, closesAt: open.closes_at, guesses: lean.guesses, advisor: null,
      } : null,
      last: lastClosed && lastOutcome ? {
        who: lastTeam ? nameOf(chats, lastTeam) : "Face-off", label: lastOutcome.result === "empty" ? null : lastOutcome.label,
        result: lastOutcome.result, rank: lastOutcome.result === "hit" ? lastOutcome.rank : null,
        already: lastOutcome.result === "miss" && lastOutcome.reason === "already", kind: lastClosed.kind, trusted: null, at: lastClosed.closed_at ?? lastClosed.closes_at,
      } : null,
      canUndo: false,
      winner: playing ? null : s1 === s2 ? 0 : s1 > s2 ? HOST : GUEST,
    },
  };
}

/** What `!cb` says during a co-stream (in either chat). */
export async function costreamStatusLine(game: GameRow): Promise<string> {
  const view = await costreamView(game);
  const v = view?.versus;
  if (!view || !v) return "🧠 Chat Brain co-stream: answer with !a <your answer>.";
  const scores = v.sides.map((s) => `${s.name} ${s.score}`).join(" · ");
  const now = v.phase === "faceoff" ? "face-off: both chats !a" : v.phase === "control" ? `${v.sides.find((s) => s.inControl)?.name ?? "A chat"} in control` : v.phase === "steal" ? `${v.turn?.side ?? "the other chat"} can steal` : v.phase === "pick_control" ? "the host is picking who plays" : "between rounds";
  return `🧠 Chat Brain co-stream, round ${v.round + 1} of ${v.rounds}: ${view.question}  ·  ${scores}  ·  ${now}`;
}

/** Close any due window so reads move the game on (overlay, dashboards, the live page). */
export async function tickCostream(game: GameRow): Promise<void> {
  const w = await gameWindow(game.id);
  if (w && w.status === "open" && Date.parse(w.closesAt) <= Date.now()) await closeWindow(w.id);
}

/** `!cb control <1|2|name>` from the host's chat. */
export async function costreamControlFromChat(gameId: string, arg: string): Promise<ControlResult> {
  const game = await loadGame(gameId);
  if (!game) return { ok: false, error: "no_game" };
  const chats = await loadChats(game);
  const a = arg.trim().toLowerCase();
  const team = a === "1" ? HOST : a === "2" ? GUEST : [...chats.values()].find((c) => c.name.toLowerCase().startsWith(a) && a)?.team ?? 0;
  return pickCostreamControl(gameId, team);
}
