import "server-only";

/**
 * Chat Brain on stream: a game of **Chat plays** (specs/gs-originals-chat-brain-stream.md,
 * build step 1). Chat is one team against 1 to 5 published boards. For each
 * board: the question shows, then guess windows of the host's length run until
 * chat clears the board or takes three strikes; the rest of the board reveals
 * and the host moves on with `!cb next`. Every viewer also plays along on
 * their own (streamRules.playAlongAwards). A **speed round** (mode "speed")
 * plays the same boards with no guess windows: the first viewer to find each
 * answer takes it (streamSpeed.ts).
 *
 * Windows live in brain_stream_windows (stream.ts opens, caches and claims
 * them); this file scores a closed window, opens the next one, and keeps the
 * game, the chat team, the reveals and the play-along table up to date. No
 * cron: overlay, dashboard and chat reads close a window that's due, and the
 * polls sweep is the backstop.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { sendChatMessage } from "@/lib/twitch/client";
import { matchGuess, type BoardAnswer } from "./rules";
import {
  BOARDS_PER_GAME,
  DEFAULT_GUESS_SECONDS,
  OVERRULE_MS,
  REVEAL_PAUSE_MS,
  SPEED_SECONDS,
  boardEndLine,
  boardOver,
  chatAnswer,
  finalLine,
  isGuessSeconds,
  leaning,
  outcomeFor,
  playAlongAwards,
  resultLine,
  speedQuestionLine,
  type ChatAnswer,
  type StreamGuess,
  type WindowOutcome,
} from "./streamRules";
import { WINDOW_COLS, dropWindow, notReady, openGuessWindow, openWindowFor, toWindow, type GuessRow, type StreamWindow } from "./stream";
import { payPrize, prizeOf, setPrize, type PrizePaid } from "./streamPrize";

const CHAT_TEAM = 1;
/** A finished game stays on the overlay this long. */
const SHOW_DONE_MS = 2 * 60_000;

export class StreamGamesNotReady extends Error {
  constructor() { super("Chat Brain stream games need chat-brain-stream-m1.sql"); this.name = "StreamGamesNotReady"; }
}

type GameRow = {
  id: string; host_community_id: string; host_user_id: string; mode: string; board_ids: string[]; current_board: number;
  rounds: number; window_seconds: number; family_safe: boolean; status: "lobby" | "playing" | "done" | "cancelled";
  created_at: string; finished_at: string | null;
  /** 1v1 and Teams: rounds banked so far (a round banks once: round = current_board + 1), and who's in control. */
  round: number; control_team: number | null; chat_advisor: boolean; chat_last_steal: boolean;
};
type TeamRow = { game_id: string; team: number; kind: string; broadcaster_id: string | null; name: string; score: number; strikes: number; members?: { name: string }[] };
type RevealRow = { board_id: string; rank: number; team: number | null; points: number; window_id: string | null };

/** 1v1 and Teams games run in streamVersus.ts; Chat plays ("host") and the speed round run here. */
export const isVersusMode = (mode: string) => mode === "versus" || mode === "teams";
export const isSpeedMode = (mode: string) => mode === "speed";
export const isCostream = (mode: string) => mode === "costream";
const costream = () => import("./streamCostream");

/** How a board's window opens: a guess of the host's length, or a speed board's open window with its 20s timer. */
async function windowOpts(game: { mode: string; window_seconds: number }): Promise<{ seconds: number; meta?: Record<string, unknown> }> {
  if (!isSpeedMode(game.mode)) return { seconds: game.window_seconds };
  const { speedMeta } = await import("./streamSpeed");
  return { seconds: SPEED_SECONDS, meta: { ...speedMeta() } };
}

const boardLine = (game: { mode: string }, i: { index: number; count: number; question: string; seconds: number }) =>
  isSpeedMode(game.mode) ? speedQuestionLine(i) : questionLine(i);

export interface StreamBoard { id: string; promptId: string; question: string; answers: BoardAnswer[] }

/** What a closed window recorded (brain_stream_windows.answer). */
interface WindowAnswer { chat: ChatAnswer | null; outcome: WindowOutcome; playalong: Record<string, number> }

export const GAME_COLS = "id, host_community_id, host_user_id, mode, board_ids, current_board, rounds, window_seconds, family_safe, status, created_at, finished_at, round, control_team, chat_advisor, chat_last_steal";

// ─── boards ──────────────────────────────────────────────────────────────────

const boardCache = new Map<string, StreamBoard>();

export async function loadBoard(boardId: string): Promise<StreamBoard | null> {
  const hit = boardCache.get(boardId);
  if (hit) return hit;
  const { data } = await createServiceClient().from("brain_boards").select("id, prompt_id, answers, brain_prompts(text)").eq("id", boardId).maybeSingle();
  if (!data) return null;
  const row = data as unknown as { id: string; prompt_id: string; answers: BoardAnswer[]; brain_prompts: { text: string } | { text: string }[] | null };
  const prompt = Array.isArray(row.brain_prompts) ? row.brain_prompts[0] : row.brain_prompts;
  const board = { id: row.id, promptId: row.prompt_id, question: prompt?.text ?? "", answers: [...(row.answers ?? [])].sort((a, b) => a.rank - b.rank) };
  boardCache.set(boardId, board);
  return board;
}

/** Published boards a community can play: the public library plus its own, newest edition each. */
export async function playableBoards(communityId: string, familySafe: boolean): Promise<{ id: string; promptId: string }[]> {
  const { data, error } = await createServiceClient()
    .from("brain_boards")
    .select("id, prompt_id, edition, family_safe, brain_prompts!inner(community_id)")
    .eq("segment", "all")
    .limit(2000);
  if (notReady(error)) throw new StreamGamesNotReady();
  const latest = new Map<string, { id: string; promptId: string; edition: number }>();
  for (const r of (data ?? []) as unknown as { id: string; prompt_id: string; edition: number; family_safe: boolean; brain_prompts: { community_id: string | null } | { community_id: string | null }[] }[]) {
    const owner = (Array.isArray(r.brain_prompts) ? r.brain_prompts[0] : r.brain_prompts)?.community_id ?? null;
    if (owner && owner !== communityId) continue;
    if (familySafe && !r.family_safe) continue;
    const cur = latest.get(r.prompt_id);
    if (!cur || r.edition > cur.edition) latest.set(r.prompt_id, { id: r.id, promptId: r.prompt_id, edition: r.edition });
  }
  return [...latest.values()].map(({ id, promptId }) => ({ id, promptId }));
}

export function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── reads ───────────────────────────────────────────────────────────────────

export async function loadGame(gameId: string): Promise<GameRow | null> {
  const { data } = await createServiceClient().from("brain_stream_games").select(GAME_COLS).eq("id", gameId).maybeSingle();
  return (data as GameRow | null) ?? null;
}

export async function loadTeam(gameId: string): Promise<TeamRow | null> {
  const { data } = await createServiceClient().from("brain_stream_teams").select("game_id, team, kind, broadcaster_id, name, score, strikes")
    .eq("game_id", gameId).eq("team", CHAT_TEAM).maybeSingle();
  return (data as TeamRow | null) ?? null;
}

export async function loadReveals(gameId: string, boardId: string): Promise<RevealRow[]> {
  const { data } = await createServiceClient().from("brain_stream_reveals").select("board_id, rank, team, points, window_id")
    .eq("game_id", gameId).eq("board_id", boardId);
  return (data ?? []) as RevealRow[];
}

/** The community's running game, or one that just finished (still worth showing). */
export async function getShowableGame(communityId: string): Promise<GameRow | null> {
  const { data, error } = await createServiceClient().from("brain_stream_games").select(GAME_COLS)
    .eq("host_community_id", communityId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (notReady(error)) return null;
  const g = (data as GameRow | null) ?? null;
  if (!g) return null;
  if (g.status === "playing") return g;
  if (g.status === "done" && g.finished_at && Date.now() - Date.parse(g.finished_at) < SHOW_DONE_MS) return g;
  return null;
}

export async function getRunningGame(communityId: string): Promise<GameRow | null> {
  const g = await getShowableGame(communityId);
  return g?.status === "playing" ? g : null;
}

export async function gameWindow(gameId: string): Promise<StreamWindow | null> {
  const { data } = await createServiceClient().from("brain_stream_windows").select(WINDOW_COLS)
    .eq("game_id", gameId).in("status", ["open", "closing"]).limit(1).maybeSingle();
  return data ? toWindow(data as Parameters<typeof toWindow>[0]) : null;
}

export async function say(broadcasterId: string | null, message: string): Promise<void> {
  const botId = process.env.TWITCH_BOT_USER_ID;
  if (!botId || !broadcasterId) return;
  await sendChatMessage({ broadcasterId, senderId: botId, message }).catch((err) => console.error("[chatbrain/game] chat line failed:", err));
}

const questionLine = (i: { index: number; count: number; question: string; seconds: number }) =>
  `🧠 ${i.count > 1 ? `Board ${i.index + 1} of ${i.count}: ` : ""}${i.question}  ▸  answer with !a <your answer>. What most of chat says counts, ${i.seconds}s a guess.`;

// ─── starting ────────────────────────────────────────────────────────────────

/**
 * `count` boards for a new game, skipping what this community played in its
 * last few games while there's enough left. `first` (the board chat just made
 * in a survey round) goes first, whatever the filters.
 */
export async function pickBoards(communityId: string, familySafe: boolean, count: number, first?: { id: string; promptId: string } | null): Promise<{ id: string; promptId: string }[] | "not_ready"> {
  let pool: { id: string; promptId: string }[];
  try { pool = await playableBoards(communityId, familySafe); } catch (err) {
    if (err instanceof StreamGamesNotReady) return "not_ready";
    throw err;
  }
  const { data: recent } = await createServiceClient().from("brain_stream_games").select("board_ids").eq("host_community_id", communityId)
    .order("created_at", { ascending: false }).limit(8);
  const played = new Set(((recent ?? []) as { board_ids: string[] }[]).flatMap((r) => r.board_ids ?? []));
  const rest = first ? count - 1 : count;
  const others = pool.filter((b) => b.id !== first?.id);
  const fresh = others.filter((b) => !played.has(b.id));
  const drawn = rest > 0 ? shuffle(fresh.length >= rest ? fresh : [...shuffle(fresh), ...shuffle(others.filter((b) => played.has(b.id)))]).slice(0, rest) : [];
  return first ? [first, ...drawn] : drawn;
}

export type StartResult =
  | { ok: true; game: GameRow }
  | { ok: false; error: "game_running" | "window_open" | "no_boards" | "not_ready" | "failed" };

export async function startGame(input: {
  communityId: string; hostUserId: string; broadcasterId: string; boards?: number; seconds?: number; familySafe?: boolean;
  /** Start with the board chat just made in a survey round. */
  first?: { id: string; promptId: string } | null;
  /** A speed round: the first viewer to find each answer takes it. */
  speed?: boolean;
  /** Tokens for the top brains at the end (needs chat-brain-stream-m2.sql). */
  prize?: number;
}): Promise<StartResult> {
  const svc = createServiceClient();
  const count = Math.min(BOARDS_PER_GAME.max, Math.max(BOARDS_PER_GAME.min, Math.round(input.boards ?? BOARDS_PER_GAME.default)));
  const seconds = isGuessSeconds(input.seconds ?? 0) ? input.seconds! : DEFAULT_GUESS_SECONDS;
  const familySafe = input.familySafe ?? true;

  if (await getRunningGame(input.communityId) || await (await costream()).inCostream(input.communityId)) return { ok: false, error: "game_running" };
  if (await openWindowFor(input.broadcasterId, { fresh: true })) return { ok: false, error: "window_open" };

  const picked = await pickBoards(input.communityId, familySafe, count, input.first);
  if (picked === "not_ready") return { ok: false, error: "not_ready" };
  const picks = picked;
  if (picks.length === 0) return { ok: false, error: "no_boards" };

  const { data: game, error } = await svc.from("brain_stream_games").insert({
    host_community_id: input.communityId, host_user_id: input.hostUserId, mode: input.speed ? "speed" : "host",
    board_ids: picks.map((p) => p.id), current_board: 0, rounds: picks.length, window_seconds: seconds,
    family_safe: familySafe, status: "playing",
  }).select(GAME_COLS).single();
  if (notReady(error)) return { ok: false, error: "not_ready" };
  if (error?.code === "23505") return { ok: false, error: "game_running" };
  if (error || !game) return { ok: false, error: "failed" };
  const g = game as GameRow;

  await svc.from("brain_stream_teams").insert({ game_id: g.id, team: CHAT_TEAM, kind: "chat", community_id: input.communityId, broadcaster_id: input.broadcasterId, name: "Chat" });
  await setPrize(g.id, input.prize);
  const board = await loadBoard(picks[0].id);
  if (!board) return { ok: false, error: "failed" };
  const opts = await windowOpts(g);
  await openGuessWindow({ gameId: g.id, communityId: input.communityId, broadcasterId: input.broadcasterId, boardId: board.promptId, team: CHAT_TEAM, seconds: opts.seconds, delayMs: REVEAL_PAUSE_MS, meta: opts.meta });
  await say(input.broadcasterId, boardLine(g, { index: 0, count: picks.length, question: board.question, seconds }));
  return { ok: true, game: g };
}

// ─── closing a window ────────────────────────────────────────────────────────

export function toGuesses(rows: GuessRow[]): StreamGuess[] {
  return rows.map((r) => ({ viewer: `${r.platform}:${r.viewer}`, name: r.name, raw: r.raw, normalized: r.normalized, at: Date.parse(r.created_at) || 0 }));
}

/** Ranks each viewer already earned on this board (from earlier windows' records). */
export async function earnedOnBoard(gameId: string, boardPromptId: string, exceptWindow: string): Promise<Map<string, Set<number>>> {
  const { data } = await createServiceClient().from("brain_stream_windows").select("id, answer")
    .eq("game_id", gameId).eq("board_id", boardPromptId).eq("status", "closed");
  const earned = new Map<string, Set<number>>();
  for (const w of (data ?? []) as { id: string; answer: WindowAnswer | null }[]) {
    if (w.id === exceptWindow) continue;
    for (const [viewer, rank] of Object.entries(w.answer?.playalong ?? {})) {
      const set = earned.get(viewer) ?? new Set<number>();
      set.add(rank);
      earned.set(viewer, set);
    }
  }
  return earned;
}

export async function addPlayAlong(gameId: string, awards: Map<string, { rank: number; points: number; name: string | null }>, windowId: string): Promise<void> {
  if (awards.size === 0) return;
  const svc = createServiceClient();
  const keys = [...awards.keys()];
  const viewers = keys.map((k) => k.slice(k.indexOf(":") + 1));
  const { data } = await svc.from("brain_stream_playalong").select("platform, viewer, points, hits").eq("game_id", gameId).in("viewer", viewers);
  const have = new Map(((data ?? []) as { platform: string; viewer: string; points: number; hits: number }[]).map((r) => [`${r.platform}:${r.viewer}`, r]));
  const rows = keys.map((k) => {
    const a = awards.get(k)!;
    const cur = have.get(k);
    return {
      game_id: gameId, platform: k.slice(0, k.indexOf(":")), viewer: k.slice(k.indexOf(":") + 1), name: a.name?.slice(0, 40) ?? null,
      points: (cur?.points ?? 0) + a.points, hits: (cur?.hits ?? 0) + 1, last_window_id: windowId,
    };
  });
  const { error } = await svc.from("brain_stream_playalong").upsert(rows, { onConflict: "game_id,platform,viewer" });
  if (error) console.error("[chatbrain/game] play-along not saved:", error);
}

/**
 * Score a game window that stream.closeWindow has claimed: bank or strike,
 * credit the play-along, post the line, then open the next window or end the
 * board.
 */
export async function closeGameWindow(window: StreamWindow, rows: GuessRow[]): Promise<void> {
  const svc = createServiceClient();
  const finish = (patch: Record<string, unknown>) =>
    svc.from("brain_stream_windows").update({ status: "closed", closed_at: new Date().toISOString(), guesses: rows.length, ...patch }).eq("id", window.id);

  const game = window.gameId ? await loadGame(window.gameId) : null;
  if (game && isVersusMode(game.mode)) {
    const { closeTurnChat } = await import("./streamVersus");
    await closeTurnChat(window, rows, game);
    return;
  }
  if (game && isCostream(game.mode)) {
    await (await costream()).closeCostreamWindow(window, rows, game);
    return;
  }
  // A speed board's window only closes when the board ends (streamSpeed.ts).
  if (game && isSpeedMode(game.mode)) {
    await finish({});
    return;
  }
  const team = game ? await loadTeam(game.id) : null;
  const board = game ? await loadBoard(game.board_ids[game.current_board]) : null;
  if (!game || !team || !board || game.status !== "playing" || window.boardId !== board.promptId) {
    await finish({});
    return;
  }

  const guesses = toGuesses(rows);
  const reveals = await loadReveals(game.id, board.id);
  const revealed = reveals.map((r) => r.rank);
  const answer = chatAnswer(guesses, board.answers);
  const outcome = outcomeFor(answer, board.answers, revealed);

  const hidden = board.answers.filter((b) => !revealed.includes(b.rank)).map((b) => b.rank);
  const awards = playAlongAwards(guesses, board.answers, hidden, await earnedOnBoard(game.id, board.promptId, window.id));
  await addPlayAlong(game.id, awards, window.id);

  let score = team.score;
  let strikes = team.strikes;
  if (outcome.result === "hit") {
    await svc.from("brain_stream_reveals").insert({ game_id: game.id, board_id: board.id, rank: outcome.rank, team: CHAT_TEAM, points: outcome.points, window_id: window.id });
    score += outcome.points;
    revealed.push(outcome.rank);
  } else {
    strikes += 1;
  }
  await svc.from("brain_stream_teams").update({ score, strikes }).eq("game_id", game.id).eq("team", CHAT_TEAM);
  const record: WindowAnswer = { chat: answer, outcome, playalong: Object.fromEntries([...awards].map(([k, a]) => [k, a.rank])) };
  await finish({ result: outcome.result, answer: record });

  await say(team.broadcaster_id, resultLine(outcome, { strikes, score }));
  if (boardOver(board.answers, revealed, strikes)) {
    await endBoard(game, { ...team, score, strikes }, board);
  } else {
    await openGuessWindow({ gameId: game.id, communityId: game.host_community_id, broadcasterId: team.broadcaster_id!, boardId: board.promptId, team: CHAT_TEAM, seconds: game.window_seconds, delayMs: REVEAL_PAUSE_MS });
  }
}

/** Reveal what chat didn't find (no points), then end the game if that was the last board. */
export async function endBoard(game: GameRow, team: TeamRow, board: StreamBoard, opts: { hint?: boolean } = {}): Promise<void> {
  const svc = createServiceClient();
  const reveals = await loadReveals(game.id, board.id);
  const found = new Set(reveals.map((r) => r.rank));
  const rest = board.answers.filter((a) => !found.has(a.rank));
  if (rest.length) {
    await svc.from("brain_stream_reveals").upsert(
      rest.map((a) => ({ game_id: game.id, board_id: board.id, rank: a.rank, team: null, points: 0 })),
      { onConflict: "game_id,board_id,rank", ignoreDuplicates: true },
    );
  }
  const last = game.current_board >= game.board_ids.length - 1;
  const boardPoints = reveals.filter((r) => r.team === CHAT_TEAM).reduce((n, r) => n + r.points, 0);
  // `hint` off when the host is already moving on (no "!cb next" nudge).
  await say(team.broadcaster_id, boardEndLine({ cleared: rest.length === 0, strikes: team.strikes, boardPoints, rest, last: last || opts.hint === false }));
  if (last) await finishGame(game, team);
}

/** The top play-along viewers, as shown on stream and the live page (names only). */
export async function topPlayAlong(gameId: string, limit = 5): Promise<{ name: string; points: number }[]> {
  return (await topPlayAlongKeyed(gameId, limit)).map(({ name, points }) => ({ name, points }));
}

/** The same with each viewer's key (platform:id), for matching prize payouts. Never sent to a page. */
export async function topPlayAlongKeyed(gameId: string, limit = 5): Promise<{ key: string; name: string; points: number }[]> {
  const { data } = await createServiceClient().from("brain_stream_playalong").select("platform, name, viewer, points")
    .eq("game_id", gameId).gt("points", 0).order("points", { ascending: false }).limit(limit);
  return ((data ?? []) as { platform: string; name: string | null; viewer: string; points: number }[])
    .map((r) => ({ key: `${r.platform}:${r.viewer}`, name: r.name || "A viewer", points: r.points }));
}

/** The top viewers with what each won from the prize, for the final chat line. */
export function withPrizes(top: { key: string; name: string; points: number }[], paid: PrizePaid[]): { name: string; points: number; tokens?: number }[] {
  const won = new Map(paid.map((p) => [p.key, p.tokens]));
  return top.map((t) => ({ name: t.name, points: t.points, tokens: won.get(t.key) }));
}

async function finishGame(game: GameRow, team: TeamRow | null): Promise<void> {
  const { data } = await createServiceClient().from("brain_stream_games").update({ status: "done", finished_at: new Date().toISOString() })
    .eq("id", game.id).eq("status", "playing").select("id").maybeSingle();
  if (!data) return; // someone else finished it
  const score = isSpeedMode(game.mode) ? await (await import("./streamSpeed")).syncSpeedScore(game.id) : team?.score ?? 0;
  const paid = await payPrize(game).catch((err) => { console.error("[chatbrain/game] prize not paid:", err); return [] as PrizePaid[]; });
  await say(team?.broadcaster_id ?? null, finalLine({ score, boards: game.current_board + 1, top: withPrizes(await topPlayAlongKeyed(game.id, 3), paid), speed: isSpeedMode(game.mode) }));
}

// ─── host controls ───────────────────────────────────────────────────────────

export type ControlResult = { ok: true; message?: string } | { ok: false; error: string };

/** Close the guess that's running now (scores it). */
export async function lockWindow(gameId: string): Promise<ControlResult> {
  const w = await gameWindow(gameId);
  if (!w || w.status !== "open") return { ok: false, error: "no_window" };
  if (w.speed) return { ok: false, error: "speed_round" };
  if (Date.parse(w.opensAt) > Date.now()) return { ok: false, error: "not_started" };
  const { closeWindow } = await import("./stream");
  await closeWindow(w.id);
  return { ok: true };
}

/** The next board: ends the current one first if it's still in play. */
export async function nextBoard(gameId: string): Promise<ControlResult> {
  const game = await loadGame(gameId);
  if (!game || game.status !== "playing") return { ok: false, error: "no_game" };
  if (isVersusMode(game.mode)) return (await import("./streamVersus")).nextRound(game);
  if (isCostream(game.mode)) return (await costream()).nextCostreamRound(game);
  const team = await loadTeam(gameId);
  const board = await loadBoard(game.board_ids[game.current_board]);
  if (!team || !board) return { ok: false, error: "failed" };

  const w = await gameWindow(gameId);
  if (w) {
    if (w.status === "closing") return { ok: false, error: "busy" };
    await dropWindow(w.id, w.broadcasterId);
    const reveals = await loadReveals(gameId, board.id);
    if (!boardOver(board.answers, reveals.map((r) => r.rank), team.strikes)) {
      await endBoard(game, team, board, { hint: false });
      if (game.current_board >= game.board_ids.length - 1) return { ok: true, message: "Game over." };
    }
  }
  if (game.current_board >= game.board_ids.length - 1) {
    await finishGame(game, team);
    return { ok: true, message: "Game over." };
  }

  const nextIndex = game.current_board + 1;
  const { data: moved } = await createServiceClient().from("brain_stream_games").update({ current_board: nextIndex })
    .eq("id", gameId).eq("current_board", game.current_board).select("id").maybeSingle();
  if (!moved) return { ok: false, error: "busy" };
  await createServiceClient().from("brain_stream_teams").update({ strikes: 0 }).eq("game_id", gameId).eq("team", CHAT_TEAM);
  const nb = await loadBoard(game.board_ids[nextIndex]);
  if (!nb) return { ok: false, error: "failed" };
  const opts = await windowOpts(game);
  await openGuessWindow({ gameId, communityId: game.host_community_id, broadcasterId: team.broadcaster_id!, boardId: nb.promptId, team: CHAT_TEAM, seconds: opts.seconds, delayMs: REVEAL_PAUSE_MS, meta: opts.meta });
  await say(team.broadcaster_id, boardLine(game, { index: nextIndex, count: game.board_ids.length, question: nb.question, seconds: game.window_seconds }));
  return { ok: true };
}

export async function setGuessTime(gameId: string, seconds: number): Promise<ControlResult> {
  if (!isGuessSeconds(seconds)) return { ok: false, error: "bad_time" };
  const { data } = await createServiceClient().from("brain_stream_games").update({ window_seconds: seconds }).eq("id", gameId).eq("status", "playing").neq("mode", "speed").select("id").maybeSingle();
  return data ? { ok: true, message: `Guesses are ${seconds}s from the next one.` } : { ok: false, error: "no_game" };
}

/**
 * Overrule the last result, within 30s. `accept` turns a miss into the board
 * answer the host names (or the one chat's answer is closest to); `reject`
 * turns a hit into a strike.
 */
export async function overrule(gameId: string, kind: "accept" | "reject", named?: string): Promise<ControlResult> {
  const svc = createServiceClient();
  const game = await loadGame(gameId);
  if (!game || game.status !== "playing") return { ok: false, error: "no_game" };
  if (isVersusMode(game.mode)) return { ok: false, error: "use_undo" };
  if (isSpeedMode(game.mode)) return { ok: false, error: "speed_round" };
  if (isCostream(game.mode)) return { ok: false, error: "use_next" };
  const [team, board] = await Promise.all([loadTeam(gameId), loadBoard(game.board_ids[game.current_board])]);
  if (!team || !board) return { ok: false, error: "failed" };
  const { data: lastRow } = await svc.from("brain_stream_windows").select("id, board_id, result, answer, closed_at, overruled")
    .eq("game_id", gameId).eq("status", "closed").not("result", "is", null).order("closed_at", { ascending: false }).limit(1).maybeSingle();
  const last = lastRow as { id: string; board_id: string; result: string; answer: WindowAnswer | null; closed_at: string; overruled: boolean } | null;
  if (!last || last.overruled || last.board_id !== board.promptId || Date.now() - Date.parse(last.closed_at) > OVERRULE_MS) return { ok: false, error: "too_late" };

  const reveals = await loadReveals(gameId, board.id);
  const revealed = reveals.map((r) => r.rank);
  // Only while the board is in play: once it's over, the rest is revealed and the host has moved on.
  if (boardOver(board.answers, revealed, team.strikes)) return { ok: false, error: "board_over" };
  let { score, strikes } = team;
  let line: string;

  if (kind === "accept") {
    if (last.result === "hit") return { ok: false, error: "already_hit" };
    const pick = matchGuess(named || last.answer?.chat?.label || "", board.answers, revealed);
    if (!pick) return { ok: false, error: "no_match" };
    await svc.from("brain_stream_reveals").insert({ game_id: gameId, board_id: board.id, rank: pick.rank, team: CHAT_TEAM, points: pick.points, window_id: last.id });
    score += pick.points;
    strikes = Math.max(0, strikes - 1);
    revealed.push(pick.rank);
    const outcome: WindowOutcome = { result: "hit", rank: pick.rank, points: pick.points, label: pick.label };
    await svc.from("brain_stream_windows").update({ overruled: true, result: "hit", answer: { ...(last.answer ?? {}), outcome } }).eq("id", last.id);
    line = `🧠 The host says it counts: #${pick.rank} ${pick.label.toUpperCase()}, ${pick.points} points! (${score} so far)`;
  } else {
    const o = last.answer?.outcome;
    if (last.result !== "hit" || o?.result !== "hit") return { ok: false, error: "not_a_hit" };
    await svc.from("brain_stream_reveals").delete().eq("game_id", gameId).eq("board_id", board.id).eq("rank", o.rank);
    score = Math.max(0, score - o.points);
    strikes += 1;
    const idx = revealed.indexOf(o.rank);
    if (idx >= 0) revealed.splice(idx, 1);
    await svc.from("brain_stream_windows").update({ overruled: true, result: "miss", answer: { ...(last.answer ?? {}), outcome: { result: "miss", reason: "not_on_board", label: o.label } } }).eq("id", last.id);
    line = `🧠 The host overruled it: that one doesn't count. ✖ Strike ${strikes}.`;
  }
  await svc.from("brain_stream_teams").update({ score, strikes }).eq("game_id", gameId).eq("team", CHAT_TEAM);
  await say(team.broadcaster_id, line);

  if (boardOver(board.answers, revealed, strikes)) {
    const w = await gameWindow(gameId);
    if (w && w.status === "open") await dropWindow(w.id, w.broadcasterId);
    await endBoard(game, { ...team, score, strikes }, board);
  }
  return { ok: true };
}

export async function endGame(gameId: string): Promise<ControlResult> {
  const game = await loadGame(gameId);
  if (!game || game.status !== "playing") return { ok: false, error: "no_game" };
  const w = await gameWindow(gameId);
  if (w && w.status === "open") await dropWindow(w.id, w.broadcasterId);
  if (isVersusMode(game.mode)) {
    await (await import("./streamVersus")).finishVersus(game);
    return { ok: true };
  }
  if (isCostream(game.mode)) {
    await (await costream()).finishCostream(game);
    return { ok: true };
  }
  await finishGame(game, await loadTeam(gameId));
  return { ok: true };
}

// ─── timers ──────────────────────────────────────────────────────────────────

/** Close the game's window if its time is up (overlay, dashboard and chat reads call this). */
export async function tickGame(game: GameRow): Promise<GameRow> {
  if (game.status !== "playing") return game;
  const w = await gameWindow(game.id);
  if (w && w.status === "open" && Date.parse(w.closesAt) <= Date.now()) {
    const { closeWindow } = await import("./stream");
    await closeWindow(w.id);
    return (await loadGame(game.id)) ?? game;
  }
  return game;
}

// ─── views ───────────────────────────────────────────────────────────────────

export interface StreamGameView {
  id: string;
  /** host = Chat plays; speed = the speed round; versus = 1v1; teams = Teams; costream = two channels' chats (then `versus` has the rest). */
  mode: "host" | "speed" | "versus" | "teams" | "costream";
  status: "playing" | "done" | "cancelled" | "lobby";
  boardIndex: number;
  boardCount: number;
  question: string;
  /** Every answer on the board, in rank order; label/points null until revealed. `found` = chat got it; `finder` = who found it (speed round). */
  slots: { rank: number; label: string | null; points: number | null; found: boolean; by?: number | null; finder?: string | null }[];
  strikes: number;
  score: number;
  seconds: number;
  /** starting = the question's first look; pause = the beat after a result; board_done = waiting for next. */
  phase: "starting" | "guessing" | "pause" | "board_done" | "done";
  window: { opensAt: string; closesAt: string; guesses: number } | null;
  /** Speed round: a find is a hit with its `finder`; a strike from the timer is "empty". */
  last: { result: "hit" | "miss" | "empty"; label: string | null; rank: number | null; already: boolean; overruled: boolean; at: string; finder?: string | null } | null;
  leaning: { label: string; share: number }[];
  playalong: { name: string; points: number }[];
  canOverrule: boolean;
  familySafe: boolean;
  /** Tokens for the top brains when the game ends (0 = none). */
  prize: number;
  versus?: import("./streamVersus").VersusView;
}

const leanCache = new Map<string, { at: number; value: StreamGameView["leaning"]; guesses: number }>();

async function currentLeaning(windowId: string, board: StreamBoard): Promise<{ leaning: StreamGameView["leaning"]; guesses: number }> {
  const hit = leanCache.get(windowId);
  if (hit && Date.now() - hit.at < 1000) return { leaning: hit.value, guesses: hit.guesses };
  const { data } = await createServiceClient().from("brain_stream_guesses").select("platform, viewer, name, raw, normalized, created_at").eq("window_id", windowId).limit(20_000);
  const guesses = toGuesses((data ?? []) as GuessRow[]);
  const value = leaning(guesses, board.answers).map((l) => ({ label: l.label, share: l.share }));
  leanCache.set(windowId, { at: Date.now(), value, guesses: guesses.length });
  if (leanCache.size > 200) leanCache.delete(leanCache.keys().next().value!);
  return { leaning: value, guesses: guesses.length };
}

export async function gameView(game: GameRow): Promise<StreamGameView | null> {
  const [view, prize] = await Promise.all([
    isVersusMode(game.mode) ? (await import("./streamVersus")).versusView(game)
      : isCostream(game.mode) ? (await costream()).costreamView(game)
      : isSpeedMode(game.mode) ? speedView(game) : hostView(game),
    prizeOf(game.id),
  ]);
  return view ? { ...view, prize } : null;
}

type ViewNoPrize = Omit<StreamGameView, "prize">;

/** A speed round: the board, who found what, the strike timer. */
async function speedView(game: GameRow): Promise<ViewNoPrize | null> {
  const index = Math.min(game.current_board, game.board_ids.length - 1);
  const [board, team, w] = await Promise.all([loadBoard(game.board_ids[index]), loadTeam(game.id), game.status === "playing" ? gameWindow(game.id) : Promise.resolve(null)]);
  if (!board || !team) return null;
  const { speedExtras, speedScore } = await import("./streamSpeed");
  const [reveals, extras, playalong, score] = await Promise.all([loadReveals(game.id, board.id), speedExtras(game.id, board.promptId), topPlayAlong(game.id), speedScore(game.id)]);
  const byRank = new Map(reveals.map((r) => [r.rank, r]));
  const now = Date.now();
  const phase: StreamGameView["phase"] = game.status !== "playing" ? "done" : !w ? "board_done" : Date.parse(w.opensAt) > now ? "starting" : "guessing";
  const ev = extras.last;
  const lastAnswer = ev?.kind === "find" ? board.answers.find((a) => a.rank === ev.rank) : null;
  return {
    id: game.id,
    mode: "speed",
    status: game.status,
    boardIndex: index,
    boardCount: game.board_ids.length,
    question: board.question,
    slots: board.answers.map((a) => {
      const r = byRank.get(a.rank);
      return { rank: a.rank, label: r ? a.label : null, points: r ? a.points : null, found: r?.team === CHAT_TEAM, finder: r?.team === CHAT_TEAM ? extras.finders.get(a.rank) ?? null : null };
    }),
    strikes: team.strikes,
    score,
    seconds: SPEED_SECONDS,
    phase,
    window: w ? { opensAt: w.opensAt, closesAt: w.closesAt, guesses: extras.guesses } : null,
    last: ev
      ? ev.kind === "find"
        ? { result: "hit", label: lastAnswer?.label ?? null, rank: ev.rank, already: false, overruled: false, at: ev.at, finder: ev.name }
        : { result: "empty", label: null, rank: null, already: false, overruled: false, at: ev.at }
      : null,
    leaning: [],
    playalong,
    canOverrule: false,
    familySafe: game.family_safe,
  };
}

async function hostView(game: GameRow): Promise<ViewNoPrize | null> {
  const svc = createServiceClient();
  const index = Math.min(game.current_board, game.board_ids.length - 1);
  const [board, team, w] = await Promise.all([loadBoard(game.board_ids[index]), loadTeam(game.id), game.status === "playing" ? gameWindow(game.id) : Promise.resolve(null)]);
  if (!board || !team) return null;
  const [reveals, { data: lastRow }, playalong] = await Promise.all([
    loadReveals(game.id, board.id),
    svc.from("brain_stream_windows").select("result, answer, closed_at, overruled, board_id").eq("game_id", game.id).eq("status", "closed")
      .not("result", "is", null).order("closed_at", { ascending: false }).limit(1).maybeSingle(),
    topPlayAlong(game.id),
  ]);
  const byRank = new Map(reveals.map((r) => [r.rank, r]));
  const now = Date.now();
  const last = lastRow as { result: "hit" | "miss" | "empty"; answer: WindowAnswer | null; closed_at: string; overruled: boolean; board_id: string } | null;
  const lastOutcome = last?.answer?.outcome;

  let phase: StreamGameView["phase"];
  if (game.status !== "playing") phase = "done";
  else if (!w) phase = "board_done";
  else if (Date.parse(w.opensAt) > now) phase = reveals.length === 0 && team.strikes === 0 ? "starting" : "pause";
  else phase = "guessing";

  const lean = w && phase === "guessing" ? await currentLeaning(w.id, board) : { leaning: [], guesses: 0 };
  return {
    id: game.id,
    mode: "host",
    status: game.status,
    boardIndex: index,
    boardCount: game.board_ids.length,
    question: board.question,
    slots: board.answers.map((a) => {
      const r = byRank.get(a.rank);
      return { rank: a.rank, label: r ? a.label : null, points: r ? a.points : null, found: r?.team === CHAT_TEAM };
    }),
    strikes: team.strikes,
    score: team.score,
    seconds: game.window_seconds,
    phase,
    window: w ? { opensAt: w.opensAt, closesAt: w.closesAt, guesses: lean.guesses } : null,
    last: last && last.board_id === board.promptId && lastOutcome
      ? {
          result: last.result,
          label: lastOutcome.result === "empty" ? null : lastOutcome.label,
          rank: lastOutcome.result === "hit" ? lastOutcome.rank : null,
          already: lastOutcome.result === "miss" && lastOutcome.reason === "already",
          overruled: last.overruled,
          at: last.closed_at,
        }
      : null,
    leaning: lean.leaning,
    playalong,
    canOverrule: !!last && !last.overruled && last.board_id === board.promptId && now - Date.parse(last.closed_at) <= OVERRULE_MS && game.status === "playing" && phase !== "board_done",
    familySafe: game.family_safe,
  };
}

/** What `!cb` says during a game. */
export async function gameStatusLine(gameId: string): Promise<string> {
  const game = await loadGame(gameId);
  if (!game) return "🧠 Chat Brain: answer with !a <your answer>.";
  if (isVersusMode(game.mode)) return (await import("./streamVersus")).versusStatusLine(game);
  if (isCostream(game.mode)) return (await costream()).costreamStatusLine(game);
  const view = await gameView(game);
  if (!view) return "🧠 Chat Brain: answer with !a <your answer>.";
  const found = view.slots.filter((s) => s.label).length;
  const left = view.window ? Math.max(0, Math.round((Date.parse(view.window.closesAt) - Date.now()) / 1000)) : 0;
  if (view.mode === "speed") {
    const clock = view.phase === "guessing" ? `first to find one with !a takes it, ${left}s on the clock` : view.phase === "board_done" ? "waiting for the next board" : "starting in a moment";
    return `🧠 Speed round, board ${view.boardIndex + 1} of ${view.boardCount}: ${view.question}  ·  ${found}/${view.slots.length} found, ${view.strikes} strike${view.strikes === 1 ? "" : "s"}  ·  ${clock}`;
  }
  const timing = view.phase === "guessing" ? `${left}s left` : view.phase === "board_done" ? "waiting for the next board" : "next guess in a moment";
  return `🧠 Chat Brain, board ${view.boardIndex + 1} of ${view.boardCount}: ${view.question}  ·  ${found}/${view.slots.length} found, ${view.strikes} strike${view.strikes === 1 ? "" : "s"}, ${view.score} points  ·  ${timing}  ·  answer with !a <your answer>`;
}

export type { GameRow as StreamGameRow, TeamRow as StreamTeamRow, RevealRow as StreamRevealRow, WindowAnswer as ChatWindowAnswer };
