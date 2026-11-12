import "server-only";

/**
 * Chat Brain on stream: a co-stream "together" (co-op picks 2026-11-11). Two
 * channels' chats are ONE team against the board, like Chat plays: every
 * guess window takes both chats' answers (the guest's chat reaches the host's
 * window through its team row, stream.channelWindow), the biggest group across
 * both chats is the answer, and the score and strikes are shared (kept on the
 * host's team row). A board ends on a clear or three strikes; the host moves
 * on. Every viewer in either chat also plays along on their own.
 *
 * It's a co-stream underneath (mode "costream": the invite, the guest's
 * accept, leaving and the lobby are streamCostream.ts's). What makes it
 * "together" is the host team row's members[0].style, read by loadChats, so no
 * migration was needed. Only the host needs GS Pro.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import {
  REVEAL_PAUSE_MS,
  boardOver,
  chatAnswer,
  leaning,
  outcomeFor,
  playAlongAwards,
  togetherBoardEndLine,
  togetherFinalLine,
  togetherQuestionLine,
  togetherResultLine,
  type ChatAnswer,
  type WindowOutcome,
} from "./streamRules";
import { dropWindow, openGuessWindow, type GuessRow, type StreamWindow } from "./stream";
import {
  addPlayAlong,
  earnedOnBoard,
  gameWindow,
  loadBoard,
  loadGame,
  loadReveals,
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
import type { PrizePaid } from "./streamPrize";

const HOST = 1;
const GUEST = 2;

/** The chats as streamCostream.loadChats reads them (only what this file needs). */
export interface TogetherChat { team: number; name: string; score: number; strikes: number; broadcasterId: string | null; state: string }

/** What a together window records (brain_stream_windows.answer). */
interface TogetherRecord { costream: true; together: true; chat?: ChatAnswer | null; outcome?: WindowOutcome; playalong?: Record<string, number>; split?: Record<string, number> }

const sides = (chats: Map<number, TogetherChat>): [string, string] => [chats.get(HOST)?.name ?? "Host", chats.get(GUEST)?.name ?? "Guest"];

async function sayBoth(chats: Map<number, TogetherChat>, message: string): Promise<void> {
  const channels = [...new Set([chats.get(HOST)?.broadcasterId, chats.get(GUEST)?.state === "joined" ? chats.get(GUEST)?.broadcasterId : null].filter((b): b is string => !!b))];
  await Promise.all(channels.map((b) => say(b, message)));
}

async function openGuess(game: GameRow, board: StreamBoard, chats: Map<number, TogetherChat>): Promise<void> {
  const host = chats.get(HOST)?.broadcasterId;
  if (!host) return;
  // team null: both chats answer every window.
  const w = await openGuessWindow({
    gameId: game.id, communityId: game.host_community_id, broadcasterId: host, boardId: board.promptId, team: null,
    seconds: game.window_seconds, delayMs: REVEAL_PAUSE_MS, kind: "guess", meta: { costream: true, together: true },
  });
  if (!w) console.error("[chatbrain/together] window not opened", { game: game.id });
}

const setHost = (gameId: string, patch: { score?: number; strikes?: number }) =>
  createServiceClient().from("brain_stream_teams").update(patch).eq("game_id", gameId).eq("team", HOST);

/** The host starts the game: the first board's question in both chats. */
export async function startTogether(game: GameRow, board: StreamBoard, chats: Map<number, TogetherChat>): Promise<void> {
  await openGuess(game, board, chats);
  await sayBoth(chats, togetherQuestionLine({ index: 0, count: game.board_ids.length, question: board.question, sides: sides(chats), seconds: game.window_seconds }));
}

/** Score a together window that stream.closeWindow has claimed. */
export async function closeTogetherWindow(window: StreamWindow, rows: GuessRow[], game: GameRow, board: StreamBoard, chats: Map<number, TogetherChat>): Promise<void> {
  const svc = createServiceClient();
  const guesses = toGuesses(rows);
  const reveals = await loadReveals(game.id, board.id);
  const revealed = reveals.map((r) => r.rank);
  const answer = chatAnswer(guesses, board.answers);
  const outcome = outcomeFor(answer, board.answers, revealed);
  const hidden = board.answers.filter((b) => !revealed.includes(b.rank)).map((b) => b.rank);
  const awards = playAlongAwards(guesses, board.answers, hidden, await earnedOnBoard(game.id, board.promptId, window.id));
  await addPlayAlong(game.id, awards, window.id);

  const host = chats.get(HOST);
  let score = host?.score ?? 0;
  let strikes = host?.strikes ?? 0;
  if (outcome.result === "hit") {
    await svc.from("brain_stream_reveals").upsert({ game_id: game.id, board_id: board.id, rank: outcome.rank, team: HOST, points: outcome.points, window_id: window.id }, { onConflict: "game_id,board_id,rank", ignoreDuplicates: true });
    score += outcome.points;
    revealed.push(outcome.rank);
  } else {
    strikes += 1;
  }
  await setHost(game.id, { score, strikes });
  const split = { [HOST]: rows.filter((r) => r.team === HOST).length, [GUEST]: rows.filter((r) => r.team === GUEST).length };
  const record: TogetherRecord = { costream: true, together: true, chat: answer, outcome, playalong: Object.fromEntries([...awards].map(([k, a]) => [k, a.rank])), split };
  await svc.from("brain_stream_windows").update({ status: "closed", closed_at: new Date().toISOString(), guesses: rows.length, result: outcome.result, answer: record }).eq("id", window.id);

  await sayBoth(chats, togetherResultLine(outcome, { strikes, score }));
  if (boardOver(board.answers, revealed, strikes)) await endTogetherBoard(game, board, chats, strikes);
  else await openGuess(game, board, chats);
}

/** Reveal what the chats didn't find; end the game after the last board. */
async function endTogetherBoard(game: GameRow, board: StreamBoard, chats: Map<number, TogetherChat>, strikes: number): Promise<void> {
  const reveals = await loadReveals(game.id, board.id);
  const found = new Set(reveals.map((r) => r.rank));
  const rest = board.answers.filter((a) => !found.has(a.rank));
  if (rest.length) {
    await createServiceClient().from("brain_stream_reveals").upsert(
      rest.map((a) => ({ game_id: game.id, board_id: board.id, rank: a.rank, team: null, points: 0 })),
      { onConflict: "game_id,board_id,rank", ignoreDuplicates: true },
    );
  }
  const last = game.current_board >= game.board_ids.length - 1;
  const boardPoints = reveals.filter((r) => r.team !== null).reduce((n, r) => n + r.points, 0);
  await sayBoth(chats, togetherBoardEndLine({ cleared: rest.length === 0, strikes, boardPoints, rest, last }));
  if (last) {
    const g = await loadGame(game.id);
    if (g?.status === "playing") await (await import("./streamCostream")).finishCostream(g);
  }
}

/** The next board: ends the one in play first (revealing the rest), or finishes after the last. */
export async function nextTogetherBoard(game: GameRow, chats: Map<number, TogetherChat>): Promise<ControlResult> {
  const svc = createServiceClient();
  const board = await loadBoard(game.board_ids[game.current_board]);
  if (!board) return { ok: false, error: "failed" };
  const w = await gameWindow(game.id);
  if (w?.status === "closing") return { ok: false, error: "busy" };
  if (w?.status === "open") {
    await dropWindow(w.id, w.broadcasterId);
    const reveals = await loadReveals(game.id, board.id);
    const strikes = chats.get(HOST)?.strikes ?? 0;
    if (!boardOver(board.answers, reveals.map((r) => r.rank), strikes)) {
      await endTogetherBoard(game, board, chats, strikes);
      if (game.current_board >= game.board_ids.length - 1) return { ok: true, message: "Game over." };
    }
  }
  if (game.current_board >= game.board_ids.length - 1) {
    const g = await loadGame(game.id);
    if (g?.status === "playing") await (await import("./streamCostream")).finishCostream(g);
    return { ok: true, message: "Game over." };
  }
  const nextIndex = game.current_board + 1;
  const { data: moved } = await svc.from("brain_stream_games").update({ current_board: nextIndex })
    .eq("id", game.id).eq("current_board", game.current_board).select("id").maybeSingle();
  if (!moved) return { ok: false, error: "busy" };
  await setHost(game.id, { strikes: 0 });
  const nb = await loadBoard(game.board_ids[nextIndex]);
  if (!nb) return { ok: false, error: "failed" };
  await openGuess({ ...game, current_board: nextIndex }, nb, chats);
  await sayBoth(chats, togetherQuestionLine({ index: nextIndex, count: game.board_ids.length, question: nb.question, sides: sides(chats), seconds: game.window_seconds }));
  return { ok: true };
}

/** The game's final line, in both chats (finishCostream sends it). */
export async function togetherFinal(game: GameRow, chats: Map<number, TogetherChat>, paid: PrizePaid[]): Promise<string> {
  return togetherFinalLine({ score: chats.get(HOST)?.score ?? 0, boards: game.current_board + 1, sides: sides(chats), top: withPrizes(await topPlayAlongKeyed(game.id, 3), paid) });
}

const leanCache = new Map<string, { at: number; value: { leaning: StreamGameView["leaning"]; split: Record<number, number> } }>();

async function windowLean(windowId: string, board: StreamBoard): Promise<{ leaning: StreamGameView["leaning"]; split: Record<number, number> }> {
  const hit = leanCache.get(windowId);
  if (hit && Date.now() - hit.at < 1000) return hit.value;
  const { data } = await createServiceClient().from("brain_stream_guesses").select("platform, viewer, name, raw, normalized, created_at, team").eq("window_id", windowId).limit(20_000);
  const rows = (data ?? []) as GuessRow[];
  const value = {
    leaning: leaning(toGuesses(rows), board.answers).map((l) => ({ label: l.label, share: l.share })),
    split: { [HOST]: rows.filter((r) => r.team === HOST).length, [GUEST]: rows.filter((r) => r.team === GUEST).length },
  };
  leanCache.set(windowId, { at: Date.now(), value });
  if (leanCache.size > 200) leanCache.delete(leanCache.keys().next().value!);
  return value;
}

/**
 * A together co-stream as the overlay, the live page and both dashboards see
 * it: Chat plays' shape (one score, shared strikes, chat's leaning across both
 * chats) plus `together` naming the two chats and how many answered from each.
 */
export async function togetherView(game: GameRow, chats: Map<number, TogetherChat>): Promise<Omit<StreamGameView, "prize"> | null> {
  const svc = createServiceClient();
  const index = Math.min(game.current_board, game.board_ids.length - 1);
  const board = await loadBoard(game.board_ids[index]);
  if (!board) return null;
  const playing = game.status === "playing";
  const [reveals, w, playalong, { data: lastRow }] = await Promise.all([
    loadReveals(game.id, board.id),
    playing ? gameWindow(game.id) : Promise.resolve(null),
    topPlayAlong(game.id),
    svc.from("brain_stream_windows").select("result, answer, closed_at, board_id").eq("game_id", game.id).eq("status", "closed")
      .not("result", "is", null).order("closed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const byRank = new Map(reveals.map((r) => [r.rank, r]));
  const now = Date.now();
  const host = chats.get(HOST);
  const strikes = host?.strikes ?? 0;
  let phase: StreamGameView["phase"];
  if (!playing) phase = "done";
  else if (!w) phase = "board_done";
  else if (Date.parse(w.opensAt) > now) phase = reveals.length === 0 && strikes === 0 ? "starting" : "pause";
  else phase = "guessing";
  const lean = w && phase === "guessing" ? await windowLean(w.id, board) : { leaning: [], split: { [HOST]: 0, [GUEST]: 0 } };
  const last = lastRow as { result: "hit" | "miss" | "empty"; answer: TogetherRecord | null; closed_at: string; board_id: string } | null;
  const lastOutcome = last?.answer?.outcome;
  const [a, b] = sides(chats);
  return {
    id: game.id,
    mode: "costream",
    status: game.status,
    boardIndex: index,
    boardCount: game.board_ids.length,
    question: board.question,
    slots: board.answers.map((x) => {
      const r = byRank.get(x.rank);
      return { rank: x.rank, label: r ? x.label : null, points: r ? x.points : null, found: !!r && r.team !== null };
    }),
    strikes,
    score: host?.score ?? 0,
    seconds: game.window_seconds,
    phase,
    window: w ? { opensAt: w.opensAt, closesAt: w.closesAt, guesses: (lean.split[HOST] ?? 0) + (lean.split[GUEST] ?? 0) } : null,
    last: last && last.board_id === board.promptId && lastOutcome ? {
      result: last.result,
      label: lastOutcome.result === "empty" ? null : lastOutcome.label,
      rank: lastOutcome.result === "hit" ? lastOutcome.rank : null,
      already: lastOutcome.result === "miss" && lastOutcome.reason === "already",
      overruled: false,
      at: last.closed_at,
    } : null,
    leaning: lean.leaning,
    playalong,
    canOverrule: false,
    familySafe: game.family_safe,
    together: { chats: [{ team: HOST, name: a, guesses: lean.split[HOST] ?? 0 }, { team: GUEST, name: b, guesses: lean.split[GUEST] ?? 0 }] },
  };
}

/** What `!cb` says during a together co-stream (in either chat). */
export async function togetherStatusLine(game: GameRow, chats: Map<number, TogetherChat>): Promise<string> {
  const view = await togetherView(game, chats);
  if (!view) return "🧠 Chat Brain co-stream: answer with !a <your answer>.";
  const found = view.slots.filter((s) => s.label).length;
  const left = view.window ? Math.max(0, Math.round((Date.parse(view.window.closesAt) - Date.now()) / 1000)) : 0;
  const timing = view.phase === "guessing" ? `${left}s left` : view.phase === "board_done" ? "waiting for the next board" : "next guess in a moment";
  return `🧠 Chat Brain co-stream, both chats on one team, board ${view.boardIndex + 1} of ${view.boardCount}: ${view.question}  ·  ${found}/${view.slots.length} found, ${view.strikes} strike${view.strikes === 1 ? "" : "s"}, ${view.score} points  ·  ${timing}  ·  answer with !a <your answer>`;
}
