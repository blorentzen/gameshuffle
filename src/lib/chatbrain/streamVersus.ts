import "server-only";

/**
 * Chat Brain on stream: **1v1 and Teams** (specs/gs-originals-chat-brain-stream.md,
 * build step 2). Two player sides play the boards; players say their answers
 * out loud and the host (or a Full mod) types them in. A round per board:
 *
 *   face-off   the host says who answered first; the top hidden answer wins
 *              control straight away, otherwise the other side answers too and
 *              the higher answer wins (both miss: again, up to 3, then the host
 *              picks)
 *   control    the side in control answers until the board is cleared (they
 *              bank the round) or three strikes
 *   steal      the other side gets one answer: a hit takes the round, a miss
 *              leaves it with the side in control, or hands chat the last
 *              steal when that's on
 *
 * Every answer goes into the round's pot; the last round of a game of 2+ is
 * worth double. Chat plays along on every turn: each turn is a window
 * (kinds faceoff / guess / steal) that collects chat's shadow guesses until
 * the host enters the side's answer or the time runs out. "Trust chat?"
 * (advisor) shows chat's answer next to the side's on a final guess or a steal;
 * `last_steal` is chat's own window.
 *
 * State lives in the existing tables (no migration): the game's `round` counts
 * rounds banked (a round banks once: round = current_board + 1) and
 * `control_team` says who's in control; each turn's window keeps the side's
 * answer (`side_answer`, `trusted`) and a record in `answer` (face-off pair and
 * attempt, who's on the clock, chat's answer, the outcome, and a snapshot for
 * undo). A taken-back turn is marked `overruled` and ignored.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { isBlockedText } from "@/lib/text/filter";
import { MAX_ANSWER_LENGTH, normalize } from "./rules";
import {
  DEFAULT_GUESS_SECONDS,
  FACEOFF_ATTEMPTS,
  REVEAL_PAUSE_MS,
  STRIKES_PER_BOARD,
  UNDO_MS,
  VERSUS_ROUNDS,
  advisorMoment,
  answerLine,
  chatAnswer,
  cleanSides,
  faceoffWinner,
  isGuessSeconds,
  lastStealOpen,
  leaning,
  onClock,
  otherSide,
  outcomeFor,
  playAlongAwards,
  playerOutcome,
  roundEndLine,
  roundMultiplier,
  sameAnswer,
  versusFinalLine,
  versusQuestionLine,
  type AdviceRecap,
  type BankReason,
  type ChatAnswer,
  type SideInput,
  type VersusMode,
  type WindowOutcome,
} from "./streamRules";
import { closeWindow, dropWindow, openGuessWindow, openWindowFor, type GuessRow, type StreamWindow } from "./stream";
import {
  GAME_COLS,
  addPlayAlong,
  earnedOnBoard,
  gameWindow,
  getRunningGame,
  isVersusMode,
  loadBoard,
  loadGame,
  loadReveals,
  pickBoards,
  say,
  toGuesses,
  topPlayAlong,
  type ControlResult,
  type StreamBoard,
  type StreamGameRow as GameRow,
  type StreamGameView,
} from "./streamGame";

const CHAT_SIDE = 3;
const PLAYER_SIDES = [1, 2] as const;

type Kind = "faceoff" | "guess" | "steal" | "last_steal";

/** What a turn's window records (brain_stream_windows.answer). */
interface TurnMeta {
  /** When the turn was opened (ms): turns are read in this order. */
  seq?: number;
  pair?: 1 | 2;
  attempt?: number;
  /** Who's answering for the side (Teams rotate). */
  player?: string | null;
  /** Chat's shadow guesses, once that part closed. */
  chat?: ChatAnswer | null;
  playalong?: Record<string, number>;
  /** The answer that was played and what it scored. */
  played?: string;
  outcome?: WindowOutcome;
  /** What chat's answer would have scored at that moment ("chat was right" stat). */
  chatOutcome?: WindowOutcome | null;
  judgedAt?: string;
  before?: Snapshot;
}

interface Snapshot { control: number | null; round: number; strikes: Record<string, number>; scores: Record<string, number> }

type TurnRow = {
  id: string; kind: Kind; team: number | null; side_answer: string | null; trusted: "side" | "chat" | null; answer: TurnMeta | null;
  result: "hit" | "miss" | "empty" | null; status: "open" | "closing" | "closed"; opens_at: string; closes_at: string;
  closed_at: string | null; overruled: boolean; board_id: string | null; broadcaster_id: string;
};
const TURN_COLS = "id, kind, team, side_answer, trusted, answer, result, status, opens_at, closes_at, closed_at, overruled, board_id, broadcaster_id";

interface Side { team: number; name: string; score: number; strikes: number; members: string[]; broadcasterId: string | null }

// ─── reads ───────────────────────────────────────────────────────────────────

async function loadSides(gameId: string): Promise<Map<number, Side>> {
  const { data } = await createServiceClient().from("brain_stream_teams").select("team, name, score, strikes, members, broadcaster_id").eq("game_id", gameId);
  const out = new Map<number, Side>();
  for (const r of (data ?? []) as { team: number; name: string; score: number; strikes: number; members: { name: string }[] | null; broadcaster_id: string | null }[]) {
    out.set(r.team, { team: r.team, name: r.name, score: r.score, strikes: r.strikes, members: (r.members ?? []).map((m) => m.name).filter(Boolean), broadcasterId: r.broadcaster_id });
  }
  return out;
}

/** A turn's place in the round: the order it was opened (start times can move, e.g. when the beat before a guess is skipped). */
const orderOf = (t: TurnRow) => t.answer?.seq ?? Date.parse(t.opens_at);

async function boardTurns(gameId: string, boardPromptId: string): Promise<TurnRow[]> {
  const { data } = await createServiceClient().from("brain_stream_windows").select(TURN_COLS)
    .eq("game_id", gameId).eq("board_id", boardPromptId).order("opens_at", { ascending: true });
  return ((data ?? []) as TurnRow[]).filter((t) => !t.overruled).sort((x, y) => orderOf(x) - orderOf(y));
}

async function readTurn(id: string): Promise<TurnRow | null> {
  const { data } = await createServiceClient().from("brain_stream_windows").select(TURN_COLS).eq("id", id).maybeSingle();
  return (data as TurnRow | null) ?? null;
}

const sideName = (sides: Map<number, Side>, team: number | null) => (team === CHAT_SIDE ? "Chat" : team ? sides.get(team)?.name ?? "That side" : "That side");
const potOf = (reveals: { team: number | null; points: number }[]) => reveals.filter((r) => r.team !== null).reduce((n, r) => n + r.points, 0);
const allFound = (board: StreamBoard, revealed: number[]) => board.answers.every((a) => revealed.includes(a.rank));

/** The player facing off for a side this round (Teams rotate by round). */
function faceoffPlayer(side: Side | undefined, roundIndex: number, mode: string): string {
  if (!side) return "";
  return mode === "teams" ? onClock(side.members, roundIndex) ?? side.name : side.name;
}

/** Who answers next for a side in control: its players take turns across the game. */
async function nextPlayer(gameId: string, side: Side | undefined, mode: string): Promise<string | null> {
  if (!side || mode !== "teams") return null;
  const { count } = await createServiceClient().from("brain_stream_windows").select("id", { count: "exact", head: true })
    .eq("game_id", gameId).eq("kind", "guess").eq("team", side.team).eq("overruled", false);
  return onClock(side.members, count ?? 0);
}

// ─── windows ─────────────────────────────────────────────────────────────────

async function openTurn(game: GameRow, board: StreamBoard, broadcasterId: string, kind: Kind, team: number | null, meta: TurnMeta, delayMs = REVEAL_PAUSE_MS): Promise<void> {
  const w = await openGuessWindow({
    gameId: game.id, communityId: game.host_community_id, broadcasterId, boardId: board.promptId,
    team, seconds: game.window_seconds, delayMs, kind, meta: { ...meta, seq: Date.now() } as Record<string, unknown>,
  });
  if (!w) console.error("[chatbrain/versus] turn window not opened", { game: game.id, kind });
}

/** Retire a turn that will never be answered (skipped, taken back, or replaced). */
async function abandonTurn(t: TurnRow): Promise<void> {
  if (t.status === "open") await dropWindow(t.id, t.broadcaster_id);
  await createServiceClient().from("brain_stream_windows").update({ overruled: true, status: "closed" }).eq("id", t.id).neq("status", "closing");
}

/**
 * A turn's window closed (time up, `!cb lock`, or the host answering): score
 * chat's play-along and keep chat's answer for "Trust chat?". The side's own
 * answer still comes from the host. Chat's last steal is judged right here.
 */
export async function closeTurnChat(window: StreamWindow, rows: GuessRow[], game: GameRow): Promise<void> {
  const svc = createServiceClient();
  const finish = (patch: Record<string, unknown>) =>
    svc.from("brain_stream_windows").update({ status: "closed", closed_at: new Date().toISOString(), guesses: rows.length, ...patch }).eq("id", window.id);
  const board = await loadBoard(game.board_ids[game.current_board]);
  if (!board || game.status !== "playing" || window.boardId !== board.promptId) {
    await finish({});
    return;
  }
  const { data: cur } = await svc.from("brain_stream_windows").select("answer").eq("id", window.id).maybeSingle();
  const guesses = toGuesses(rows);
  const reveals = await loadReveals(game.id, board.id);
  const revealed = reveals.map((r) => r.rank);
  const chat = chatAnswer(guesses, board.answers);
  const hidden = board.answers.filter((b) => !revealed.includes(b.rank)).map((b) => b.rank);
  const awards = playAlongAwards(guesses, board.answers, hidden, await earnedOnBoard(game.id, board.promptId, window.id));
  await addPlayAlong(game.id, awards, window.id);
  const meta: TurnMeta = { ...((cur as { answer: TurnMeta | null } | null)?.answer ?? {}), chat, playalong: Object.fromEntries([...awards].map(([k, a]) => [k, a.rank])) };

  if (window.kind === "last_steal") {
    const outcome = outcomeFor(chat, board.answers, revealed);
    await finish({ result: outcome.result, answer: { ...meta, outcome, judgedAt: new Date().toISOString() } });
    if (outcome.result === "hit") {
      await svc.from("brain_stream_reveals").insert({ game_id: game.id, board_id: board.id, rank: outcome.rank, team: CHAT_SIDE, points: outcome.points, window_id: window.id });
      await say(window.broadcasterId, answerLine("Chat", outcome));
      await bankRound(game, board, CHAT_SIDE, "chat");
    } else {
      await say(window.broadcasterId, outcome.result === "empty" ? "🧠 Nobody in chat answered." : answerLine("Chat", outcome));
      await bankRound(game, board, game.control_team, "held");
    }
    return;
  }
  await finish({ answer: meta });
}

/** Close chat's part of a turn (if it's still open) and read the turn back. */
async function settleChat(turn: TurnRow): Promise<TurnRow | null> {
  if (turn.status === "open") await closeWindow(turn.id);
  for (let i = 0; i < 20; i++) {
    const row = await readTurn(turn.id);
    if (!row) return null;
    if (row.status === "closed") return row;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

// ─── starting ────────────────────────────────────────────────────────────────

export type VersusStartResult =
  | { ok: true; game: GameRow }
  | { ok: false; error: "game_running" | "window_open" | "no_boards" | "not_ready" | "failed" | "bad_sides" | "same_names" | "team_size" | "blocked" };

export async function startVersus(input: {
  communityId: string; hostUserId: string; broadcasterId: string; mode: VersusMode; sides: SideInput[];
  rounds?: number; seconds?: number; familySafe?: boolean; chatAdvisor?: boolean; chatLastSteal?: boolean;
  /** Start with the board chat just made in a survey round. */
  first?: { id: string; promptId: string } | null;
}): Promise<VersusStartResult> {
  const svc = createServiceClient();
  const clean = cleanSides(input.mode, input.sides);
  if (!clean.ok) return { ok: false, error: clean.error };
  if (clean.sides.some((s) => isBlockedText(s.name) || s.members.some((m) => isBlockedText(m)))) return { ok: false, error: "blocked" };
  const count = Math.min(VERSUS_ROUNDS.max, Math.max(VERSUS_ROUNDS.min, Math.round(input.rounds ?? VERSUS_ROUNDS.default)));
  const seconds = isGuessSeconds(input.seconds ?? 0) ? input.seconds! : DEFAULT_GUESS_SECONDS;
  const familySafe = input.familySafe ?? true;

  if (await getRunningGame(input.communityId)) return { ok: false, error: "game_running" };
  if (await openWindowFor(input.broadcasterId, { fresh: true })) return { ok: false, error: "window_open" };
  const picks = await pickBoards(input.communityId, familySafe, count, input.first);
  if (picks === "not_ready") return { ok: false, error: "not_ready" };
  if (picks.length === 0) return { ok: false, error: "no_boards" };

  const { data: row, error } = await svc.from("brain_stream_games").insert({
    host_community_id: input.communityId, host_user_id: input.hostUserId, mode: input.mode,
    board_ids: picks.map((p) => p.id), current_board: 0, rounds: picks.length, window_seconds: seconds,
    family_safe: familySafe, status: "playing", round: 0, control_team: null,
    chat_advisor: !!input.chatAdvisor, chat_last_steal: !!input.chatLastSteal,
  }).select(GAME_COLS).single();
  if (error?.code === "23505") return { ok: false, error: "game_running" };
  if (error || !row) return { ok: false, error: error?.code === "42P01" ? "not_ready" : "failed" };
  const game = row as GameRow;

  // Same keys on every row: a bulk insert sends missing keys as null, not the column default.
  const { error: teamErr } = await svc.from("brain_stream_teams").insert([
    ...clean.sides.map((s, i) => ({ game_id: game.id, team: i + 1, kind: "players", community_id: null, broadcaster_id: null, name: s.name, members: s.members.map((name) => ({ name })) })),
    { game_id: game.id, team: CHAT_SIDE, kind: "chat", community_id: input.communityId, broadcaster_id: input.broadcasterId, name: "Chat", members: [] },
  ]);
  if (teamErr) console.error("[chatbrain/versus] sides not saved:", teamErr);
  const board = await loadBoard(picks[0].id);
  if (teamErr || !board) {
    await svc.from("brain_stream_games").update({ status: "cancelled", finished_at: new Date().toISOString() }).eq("id", game.id);
    return { ok: false, error: "failed" };
  }
  await startRound(game, board, 0, await loadSides(game.id), input.broadcasterId);
  return { ok: true, game };
}

async function startRound(game: GameRow, board: StreamBoard, index: number, sides: Map<number, Side>, broadcasterId: string): Promise<void> {
  const players: [string, string] = [faceoffPlayer(sides.get(1), index, game.mode), faceoffPlayer(sides.get(2), index, game.mode)];
  await openTurn(game, board, broadcasterId, "faceoff", null, { pair: 1, attempt: 1 });
  await say(broadcasterId, versusQuestionLine({
    round: index, rounds: game.board_ids.length, question: board.question,
    sides: [sideName(sides, 1), sideName(sides, 2)], double: roundMultiplier(index, game.board_ids.length) > 1, faceoff: players,
  }));
}

// ─── the host's answers ──────────────────────────────────────────────────────

export type VersusError =
  | "no_game" | "not_versus" | "round_over" | "no_turn" | "chat_turn" | "choose_first" | "pick_side" | "empty_answer" | "blocked"
  | "busy" | "no_choice" | "has_control" | "nothing_to_undo" | "too_late" | "failed";

interface Ctx { game: GameRow; board: StreamBoard; broadcasterId: string; sides: Map<number, Side> }

async function context(gameId: string): Promise<Ctx | { error: VersusError }> {
  const game = await loadGame(gameId);
  if (!game || game.status !== "playing") return { error: "no_game" };
  if (!isVersusMode(game.mode)) return { error: "not_versus" };
  const [board, sides] = await Promise.all([loadBoard(game.board_ids[game.current_board]), loadSides(game.id)]);
  const broadcasterId = sides.get(CHAT_SIDE)?.broadcasterId;
  if (!board || !broadcasterId) return { error: "failed" };
  return { game, board, broadcasterId, sides };
}

/**
 * The host types what a side said. During a face-off the host also says which
 * side answered first (`side`). On a final guess or a steal with "Trust chat?"
 * on, the side's answer is locked in and chat's is shown beside it; `trust`
 * then plays one of them.
 */
export async function submitAnswer(gameId: string, input: { text: string; side?: number }): Promise<ControlResult> {
  const ctx = await context(gameId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { game, board, sides, broadcasterId } = ctx;
  const raw = input.text.trim().replace(/\s+/g, " ").slice(0, MAX_ANSWER_LENGTH);
  if (!normalize(raw)) return { ok: false, error: "empty_answer" };
  if (isBlockedText(raw)) return { ok: false, error: "blocked" };
  if (game.round > game.current_board) return { ok: false, error: "round_over" };

  const current = (await boardTurns(game.id, board.promptId)).at(-1);
  if (!current || current.result !== null) return { ok: false, error: "no_turn" };
  if (current.kind === "last_steal") return { ok: false, error: "chat_turn" };
  if (current.side_answer) return { ok: false, error: "choose_first" };
  let team = current.team;
  if (current.kind === "faceoff" && team === null) {
    if (input.side !== 1 && input.side !== 2) return { ok: false, error: "pick_side" };
    team = input.side;
  }
  const turn = await settleChat(current);
  if (!turn || turn.result !== null || turn.side_answer || turn.overruled) return { ok: false, error: "busy" };

  const strikes = game.control_team ? sides.get(game.control_team)?.strikes ?? 0 : 0;
  const chat = turn.answer?.chat ?? null;
  if (game.chat_advisor && advisorMoment(turn.kind, strikes) && chat && !sameAnswer(raw, chat, board.answers)) {
    const { data: locked } = await createServiceClient().from("brain_stream_windows").update({ side_answer: raw, team })
      .eq("id", turn.id).is("side_answer", null).is("result", null).select("id").maybeSingle();
    if (!locked) return { ok: false, error: "busy" };
    await say(broadcasterId, `🧠 ${sideName(sides, team)} locks in ${raw.toUpperCase()}. Chat says ${chat.label.toUpperCase()} (${Math.round(chat.share * 100)}% of ${chat.total}). Trust chat?`.slice(0, 480));
    return { ok: true, message: "advisor" };
  }
  return judgeTurn(ctx, { ...turn, team }, raw, null);
}

/** "Trust chat?": play the side's locked-in answer, or chat's. */
export async function trust(gameId: string, pick: "side" | "chat"): Promise<ControlResult> {
  const ctx = await context(gameId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const turn = (await boardTurns(ctx.game.id, ctx.board.promptId)).at(-1);
  const chat = turn?.answer?.chat;
  if (!turn || turn.result !== null || !turn.side_answer || !chat) return { ok: false, error: "no_choice" };
  return judgeTurn(ctx, turn, pick === "chat" ? chat.label : turn.side_answer, pick);
}

async function judgeTurn(ctx: Ctx, turn: TurnRow, played: string, trusted: "side" | "chat" | null): Promise<ControlResult> {
  const { game, board, sides, broadcasterId } = ctx;
  const svc = createServiceClient();
  const reveals = await loadReveals(game.id, board.id);
  const revealedBefore = reveals.map((r) => r.rank);
  const outcome = playerOutcome(played, board.answers, revealedBefore);
  const chat = turn.answer?.chat ?? null;
  const before: Snapshot = {
    control: game.control_team, round: game.round,
    strikes: Object.fromEntries([...sides].map(([t, s]) => [String(t), s.strikes])),
    scores: Object.fromEntries([...sides].map(([t, s]) => [String(t), s.score])),
  };
  const meta: TurnMeta = {
    ...(turn.answer ?? {}), played, outcome, judgedAt: new Date().toISOString(), before,
    chatOutcome: chat ? outcomeFor(chat, board.answers, revealedBefore) : null,
  };
  const { data: claimed } = await svc.from("brain_stream_windows")
    .update({ result: outcome.result, side_answer: turn.side_answer ?? played, trusted, team: turn.team, answer: meta })
    .eq("id", turn.id).is("result", null).select("id").maybeSingle();
  if (!claimed) return { ok: false, error: "busy" };
  if (outcome.result === "hit") {
    await svc.from("brain_stream_reveals").insert({ game_id: game.id, board_id: board.id, rank: outcome.rank, team: turn.team, points: outcome.points, window_id: turn.id });
  }
  const revealed = outcome.result === "hit" ? [...revealedBefore, outcome.rank] : revealedBefore;
  // Teams: name the player answering ("Ann (Blue)"); a steal is the whole team's call.
  const player = game.mode !== "teams" || turn.kind === "steal" ? null
    : turn.kind === "faceoff" ? faceoffPlayer(sides.get(turn.team!), game.current_board, game.mode) : turn.answer?.player ?? null;
  const name = player ? `${player} (${sideName(sides, turn.team)})` : sideName(sides, turn.team);
  const who = trusted === "chat" ? `${name}, going with chat,` : trusted === "side" ? `${name}, sticking with their answer,` : name;

  if (turn.kind === "faceoff") return faceoffNext(ctx, turn, outcome, revealedBefore, revealed, who);
  if (turn.kind === "guess") {
    const side = turn.team!;
    if (outcome.result === "hit") {
      if (allFound(board, revealed)) {
        await say(broadcasterId, answerLine(who, outcome));
        await bankRound(game, board, side, "cleared");
        return { ok: true };
      }
      const player = await nextPlayer(game.id, sides.get(side), game.mode);
      await openTurn(game, board, broadcasterId, "guess", side, { player });
      await say(broadcasterId, answerLine(who, outcome, player ? `Next up: ${player}.` : ""));
      return { ok: true };
    }
    const strikes = (sides.get(side)?.strikes ?? 0) + 1;
    await svc.from("brain_stream_teams").update({ strikes }).eq("game_id", game.id).eq("team", side);
    if (strikes >= STRIKES_PER_BOARD) {
      const other = otherSide(side);
      const pot = potOf(await loadReveals(game.id, board.id)) * roundMultiplier(game.current_board, game.board_ids.length);
      await openTurn(game, board, broadcasterId, "steal", other, {});
      await say(broadcasterId, answerLine(who, outcome, `✖ Strike ${strikes}! ${sideName(sides, other)}, one answer to steal ${pot} points.`));
      return { ok: true };
    }
    const player = await nextPlayer(game.id, sides.get(side), game.mode);
    await openTurn(game, board, broadcasterId, "guess", side, { player });
    await say(broadcasterId, answerLine(who, outcome, `✖ Strike ${strikes}.${player ? ` Next up: ${player}.` : ""}`));
    return { ok: true };
  }
  // steal
  if (outcome.result === "hit") {
    await say(broadcasterId, answerLine(who, outcome));
    await bankRound(game, board, turn.team, "stole");
    return { ok: true };
  }
  if (lastStealOpen({ enabled: game.chat_last_steal, stealHit: false, trusted })) {
    const pot = potOf(await loadReveals(game.id, board.id)) * roundMultiplier(game.current_board, game.board_ids.length);
    await openTurn(game, board, broadcasterId, "last_steal", CHAT_SIDE, {});
    await say(broadcasterId, answerLine(who, outcome, `Chat, it's your last steal for ${pot} points: answer with !a <your answer>. ${game.window_seconds}s once it opens!`));
    return { ok: true };
  }
  await say(broadcasterId, answerLine(who, outcome));
  await bankRound(game, board, game.control_team, "held");
  return { ok: true };
}

async function faceoffNext(ctx: Ctx, turn: TurnRow, outcome: WindowOutcome, revealedBefore: number[], revealed: number[], who: string): Promise<ControlResult> {
  const { game, board, sides, broadcasterId } = ctx;
  const team = turn.team!;
  const pair = turn.answer?.pair ?? 1;
  const attempt = turn.answer?.attempt ?? 1;
  const hidden = board.answers.filter((a) => !revealedBefore.includes(a.rank)).map((a) => a.rank);
  const topHidden = hidden.length ? Math.min(...hidden) : 0;

  if (pair === 1) {
    if (faceoffWinner(outcome, null, topHidden) === "first") {
      return takeControl(ctx, team, answerLine(who, outcome, `That's the top answer! ${sideName(sides, team)} takes control.`), revealed);
    }
    const other = otherSide(team);
    await openTurn(game, board, broadcasterId, "faceoff", other, { pair: 2, attempt, player: faceoffPlayer(sides.get(other), game.current_board, game.mode) });
    await say(broadcasterId, answerLine(who, outcome, outcome.result === "hit" ? `${sideName(sides, other)}, can you beat it?` : `${sideName(sides, other)}, your answer.`));
    return { ok: true };
  }

  const first = (await boardTurns(game.id, board.promptId))
    .filter((t) => t.kind === "faceoff" && t.answer?.pair === 1 && (t.answer?.attempt ?? 1) === attempt && t.result !== null).at(-1);
  const firstOutcome: WindowOutcome = first?.answer?.outcome ?? { result: "empty" };
  const winner = faceoffWinner(firstOutcome, outcome, topHidden);
  if ((winner === "first" && first?.team) || winner === "second") {
    const side = winner === "first" ? first!.team! : team;
    return takeControl(ctx, side, answerLine(who, outcome, `${sideName(sides, side)} takes control!`), revealed);
  }
  if (attempt < FACEOFF_ATTEMPTS) {
    await openTurn(game, board, broadcasterId, "faceoff", null, { pair: 1, attempt: attempt + 1 });
    await say(broadcasterId, answerLine(who, outcome, "Nobody found one. Face-off again!"));
  } else {
    await say(broadcasterId, answerLine(who, outcome, `No luck after ${FACEOFF_ATTEMPTS} face-offs. The host picks who plays.`));
  }
  return { ok: true };
}

async function takeControl(ctx: Ctx, side: number, line: string, revealed: number[]): Promise<ControlResult> {
  const { game, board, sides, broadcasterId } = ctx;
  const svc = createServiceClient();
  await svc.from("brain_stream_games").update({ control_team: side }).eq("id", game.id);
  await svc.from("brain_stream_teams").update({ strikes: 0 }).eq("game_id", game.id).in("team", [...PLAYER_SIDES]);
  const g = { ...game, control_team: side };
  if (allFound(board, revealed)) {
    await say(broadcasterId, line);
    await bankRound(g, board, side, "cleared");
    return { ok: true };
  }
  const player = await nextPlayer(game.id, sides.get(side), game.mode);
  await openTurn(g, board, broadcasterId, "guess", side, { player });
  await say(broadcasterId, `${line}${player ? ` On the clock: ${player}.` : ""}`.slice(0, 480));
  return { ok: true };
}

/** The host picks who plays (after three face-offs with no answer, or to skip the face-off). */
export async function pickControl(gameId: string, side: number): Promise<ControlResult> {
  if (side !== 1 && side !== 2) return { ok: false, error: "pick_side" };
  const ctx = await context(gameId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { game, board, sides } = ctx;
  if (game.round > game.current_board) return { ok: false, error: "round_over" };
  if (game.control_team) return { ok: false, error: "has_control" };
  const current = (await boardTurns(game.id, board.promptId)).at(-1);
  if (current?.status === "closing") return { ok: false, error: "busy" };
  if (current && current.result === null) await abandonTurn(current);
  const reveals = await loadReveals(game.id, board.id);
  return takeControl(ctx, side, `🧠 The host gives control to ${sideName(sides, side)}.`, reveals.map((r) => r.rank));
}

// ─── banking a round ─────────────────────────────────────────────────────────

async function bankRound(game: GameRow, board: StreamBoard, winner: number | null, reason: BankReason): Promise<void> {
  const svc = createServiceClient();
  const { data: claimed } = await svc.from("brain_stream_games").update({ round: game.current_board + 1 })
    .eq("id", game.id).eq("status", "playing").lte("round", game.current_board).select(GAME_COLS).maybeSingle();
  if (!claimed) return; // already banked
  const reveals = await loadReveals(game.id, board.id);
  const mult = roundMultiplier(game.current_board, game.board_ids.length);
  const points = reason === "skipped" ? 0 : potOf(reveals) * mult;
  const sides = await loadSides(game.id);
  if (winner && points > 0) {
    const cur = sides.get(winner);
    if (cur) {
      cur.score += points;
      await svc.from("brain_stream_teams").update({ score: cur.score }).eq("game_id", game.id).eq("team", winner);
    }
  }
  const found = new Set(reveals.map((r) => r.rank));
  const rest = board.answers.filter((a) => !found.has(a.rank));
  if (rest.length) {
    await svc.from("brain_stream_reveals").upsert(
      rest.map((a) => ({ game_id: game.id, board_id: board.id, rank: a.rank, team: null, points: 0 })),
      { onConflict: "game_id,board_id,rank", ignoreDuplicates: true },
    );
  }
  const advice: AdviceRecap[] = (await boardTurns(game.id, board.promptId))
    .filter((t) => t.trusted && t.answer?.chat)
    .map((t) => ({
      side: sideName(sides, t.team), trusted: t.trusted!, chatLabel: t.answer!.chat!.label,
      chatHit: t.answer?.chatOutcome?.result === "hit", chatRank: t.answer?.chatOutcome?.result === "hit" ? t.answer.chatOutcome.rank : null,
    }));
  const last = game.current_board >= game.board_ids.length - 1;
  const scores = [1, 2].map((t) => ({ name: sideName(sides, t), score: sides.get(t)?.score ?? 0 }));
  if ((sides.get(CHAT_SIDE)?.score ?? 0) > 0) scores.push({ name: "Chat", score: sides.get(CHAT_SIDE)!.score });
  await say(sides.get(CHAT_SIDE)?.broadcasterId ?? null, roundEndLine({
    winner: winner ? sideName(sides, winner) : null, reason, points, double: mult > 1, rest, scores, advice, last,
  }));
  if (last) await finishVersus(claimed as GameRow);
}

export async function finishVersus(game: GameRow): Promise<void> {
  const svc = createServiceClient();
  const { data } = await svc.from("brain_stream_games").update({ status: "done", finished_at: new Date().toISOString() })
    .eq("id", game.id).eq("status", "playing").select("id").maybeSingle();
  if (!data) return;
  const sides = await loadSides(game.id);
  const { data: asked } = await svc.from("brain_stream_windows").select("answer").eq("game_id", game.id).eq("overruled", false).not("trusted", "is", null);
  const moments = (asked ?? []) as { answer: TurnMeta | null }[];
  await say(sides.get(CHAT_SIDE)?.broadcasterId ?? null, versusFinalLine({
    sides: [1, 2].map((t) => ({ name: sideName(sides, t), score: sides.get(t)?.score ?? 0 })),
    chatScore: sides.get(CHAT_SIDE)?.score ?? 0,
    chatRight: { right: moments.filter((m) => m.answer?.chatOutcome?.result === "hit").length, asked: moments.length },
    top: await topPlayAlong(game.id, 3),
  }));
}

/** The next round: skips the one in play (nobody banks it) or finishes the game after the last. */
export async function nextRound(game: GameRow): Promise<ControlResult> {
  const svc = createServiceClient();
  const board = await loadBoard(game.board_ids[game.current_board]);
  const sides = await loadSides(game.id);
  const broadcasterId = sides.get(CHAT_SIDE)?.broadcasterId;
  if (!board || !broadcasterId) return { ok: false, error: "failed" };
  const w = await gameWindow(game.id);
  if (w?.status === "closing") return { ok: false, error: "busy" };
  const pending = (await boardTurns(game.id, board.promptId)).filter((t) => t.result === null);
  for (const t of pending) await abandonTurn(t);
  if (game.round <= game.current_board) await bankRound(game, board, null, "skipped");
  if (game.current_board >= game.board_ids.length - 1) {
    const g = await loadGame(game.id);
    if (g?.status === "playing") await finishVersus(g);
    return { ok: true, message: "Game over." };
  }
  const nextIndex = game.current_board + 1;
  const { data: moved } = await svc.from("brain_stream_games").update({ current_board: nextIndex, control_team: null })
    .eq("id", game.id).eq("current_board", game.current_board).eq("status", "playing").select(GAME_COLS).maybeSingle();
  if (!moved) return { ok: false, error: "busy" };
  await svc.from("brain_stream_teams").update({ strikes: 0 }).eq("game_id", game.id).in("team", [...PLAYER_SIDES]);
  const nb = await loadBoard(game.board_ids[nextIndex]);
  if (!nb) return { ok: false, error: "failed" };
  await startRound(moved as GameRow, nb, nextIndex, await loadSides(game.id), broadcasterId);
  return { ok: true };
}

/**
 * Take back the last answer the host entered (a typo, or the wrong side), within
 * a minute and before anything else was answered. Strikes, control, the pot and
 * a banked round all go back, and the same turn opens again.
 */
export async function undoLast(gameId: string): Promise<ControlResult> {
  const ctx = await context(gameId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { game, board, sides, broadcasterId } = ctx;
  const svc = createServiceClient();
  const turns = await boardTurns(game.id, board.promptId);
  const last = turns.filter((t) => t.result !== null && t.kind !== "last_steal").at(-1);
  if (!last) return { ok: false, error: "nothing_to_undo" };
  const snap = last.answer?.before;
  const later = turns.filter((t) => orderOf(t) > orderOf(last));
  if (!snap || Date.now() - Date.parse(last.answer?.judgedAt ?? "") > UNDO_MS || later.some((t) => t.result !== null)) return { ok: false, error: "too_late" };
  if (later.some((t) => t.status === "closing")) return { ok: false, error: "busy" };
  for (const t of later) await abandonTurn(t);

  await svc.from("brain_stream_reveals").delete().eq("game_id", game.id).eq("board_id", board.id).eq("window_id", last.id);
  if (game.round > snap.round) {
    await svc.from("brain_stream_reveals").delete().eq("game_id", game.id).eq("board_id", board.id).is("team", null).is("window_id", null);
  }
  await svc.from("brain_stream_games").update({ round: snap.round, control_team: snap.control }).eq("id", game.id);
  for (const [team, strikes] of Object.entries(snap.strikes)) {
    await svc.from("brain_stream_teams").update({ strikes, score: snap.scores[team] ?? 0 }).eq("game_id", game.id).eq("team", Number(team));
  }
  await svc.from("brain_stream_windows").update({ overruled: true }).eq("id", last.id);
  const pair = last.answer?.pair;
  const g = { ...game, round: snap.round, control_team: snap.control };
  await openTurn(g, board, broadcasterId, last.kind, last.kind === "faceoff" && pair === 1 ? null : last.team, { pair, attempt: last.answer?.attempt, player: last.answer?.player ?? null });
  await say(broadcasterId, `🧠 The host took back ${sideName(sides, last.team)}'s last answer. Go again!`);
  return { ok: true };
}

// ─── chat grammar for the host and mods ──────────────────────────────────────

/** A side from a chat word: 1, 2, or (the start of) its name. */
function sideFromWord(word: string, sides: Map<number, Side>): number | null {
  const w = word.toLowerCase();
  if (w === "1" || w === "2") return Number(w);
  for (const t of PLAYER_SIDES) {
    const name = sides.get(t)?.name.toLowerCase() ?? "";
    if (name && (name === w || name.split(/\s+/)[0] === w)) return t;
  }
  return null;
}

/** `!cb play [side] <answer>`: the side is only needed for the first face-off answer. */
export async function playFromChat(gameId: string, text: string): Promise<ControlResult> {
  const ctx = await context(gameId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const current = (await boardTurns(ctx.game.id, ctx.board.promptId)).at(-1);
  if (current?.kind === "faceoff" && current.team === null) {
    const [first, ...rest] = text.trim().split(/\s+/);
    const side = sideFromWord(first ?? "", ctx.sides);
    if (!side || !rest.length) return { ok: false, error: "pick_side" };
    return submitAnswer(gameId, { text: rest.join(" "), side });
  }
  return submitAnswer(gameId, { text });
}

/** `!cb trust chat` / `!cb trust team` (or the side's name). */
export async function trustFromChat(gameId: string, word: string): Promise<ControlResult> {
  const w = word.trim().toLowerCase();
  return trust(gameId, w === "chat" ? "chat" : "side");
}

/** `!cb control <side>`. */
export async function controlFromChat(gameId: string, word: string): Promise<ControlResult> {
  const ctx = await context(gameId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  return pickControl(gameId, sideFromWord(word.trim(), ctx.sides) ?? 0);
}

// ─── views ───────────────────────────────────────────────────────────────────

export interface VersusView {
  round: number;
  rounds: number;
  double: boolean;
  sides: { team: number; name: string; score: number; strikes: number; members: string[]; inControl: boolean }[];
  chat: { score: number; advisor: boolean; lastSteal: boolean };
  phase: "faceoff" | "control" | "steal" | "last_steal" | "pick_control" | "round_done" | "done";
  /** Points in play this round (before doubling). */
  pot: number;
  /** Who faces off for each side this round. */
  faceoff: [string, string];
  turn: null | {
    kind: Kind; team: number | null; side: string | null; player: string | null; pair: number | null; attempt: number | null;
    /** pause = the beat before chat can guess; open = chat guessing while the side answers; waiting = chat's part over, waiting for the side; advisor = choose; chat = chat's last steal. */
    state: "pause" | "open" | "waiting" | "advisor" | "chat";
    opensAt: string; closesAt: string; guesses: number;
    advisor: { side: string; chat: string; share: number; total: number } | null;
  };
  last: null | { who: string; label: string | null; result: "hit" | "miss" | "empty"; rank: number | null; already: boolean; kind: Kind; trusted: "side" | "chat" | null; at: string };
  canUndo: boolean;
  /** When the game is over: 1 or 2, or 0 for a tie. */
  winner: number | null;
}

const countCache = new Map<string, { at: number; guesses: number; lean: StreamGameView["leaning"] }>();

async function windowGuesses(windowId: string, board: StreamBoard, withLeaning: boolean): Promise<{ guesses: number; lean: StreamGameView["leaning"] }> {
  const hit = countCache.get(windowId);
  if (hit && Date.now() - hit.at < 1000) return hit;
  const svc = createServiceClient();
  let value: { guesses: number; lean: StreamGameView["leaning"] };
  if (withLeaning) {
    const { data } = await svc.from("brain_stream_guesses").select("platform, viewer, name, raw, normalized, created_at").eq("window_id", windowId).limit(20_000);
    const guesses = toGuesses((data ?? []) as GuessRow[]);
    value = { guesses: guesses.length, lean: leaning(guesses, board.answers).map((l) => ({ label: l.label, share: l.share })) };
  } else {
    const { count } = await svc.from("brain_stream_guesses").select("viewer", { count: "exact", head: true }).eq("window_id", windowId);
    value = { guesses: count ?? 0, lean: [] };
  }
  countCache.set(windowId, { at: Date.now(), ...value });
  if (countCache.size > 200) countCache.delete(countCache.keys().next().value!);
  return value;
}

export async function versusView(game: GameRow): Promise<StreamGameView | null> {
  const index = Math.min(game.current_board, game.board_ids.length - 1);
  const board = await loadBoard(game.board_ids[index]);
  if (!board) return null;
  const [sides, reveals, turns, playalong] = await Promise.all([loadSides(game.id), loadReveals(game.id, board.id), boardTurns(game.id, board.promptId), topPlayAlong(game.id)]);
  const now = Date.now();
  const byRank = new Map(reveals.map((r) => [r.rank, r]));
  const current = turns.at(-1) ?? null;
  const banked = game.round > index;
  const pending = current && current.result === null ? current : null;
  const kindPhase = { faceoff: "faceoff", guess: "control", steal: "steal", last_steal: "last_steal" } as const;

  let phase: VersusView["phase"];
  if (game.status !== "playing") phase = "done";
  else if (banked) phase = "round_done";
  else if (!current) phase = "faceoff";
  else if (!pending && current.kind === "faceoff" && !game.control_team) phase = "pick_control";
  else phase = kindPhase[current.kind];

  let turn: VersusView["turn"] = null;
  let lean: StreamGameView["leaning"] = [];
  let guessCount = 0;
  if (pending && game.status === "playing" && !banked) {
    const opens = Date.parse(pending.opens_at);
    const state: NonNullable<VersusView["turn"]>["state"] =
      pending.status !== "closed" ? (opens > now ? "pause" : pending.kind === "last_steal" ? "chat" : "open")
        : pending.side_answer ? "advisor" : "waiting";
    if (pending.status !== "closed") {
      const g = await windowGuesses(pending.id, board, pending.kind === "last_steal");
      guessCount = g.guesses;
      lean = g.lean;
    }
    const chat = pending.answer?.chat ?? null;
    turn = {
      kind: pending.kind, team: pending.team, side: pending.team ? sideName(sides, pending.team) : null, player: pending.answer?.player ?? null,
      pair: pending.answer?.pair ?? null, attempt: pending.answer?.attempt ?? null, state,
      opensAt: pending.opens_at, closesAt: pending.closes_at, guesses: guessCount,
      advisor: state === "advisor" && chat && pending.side_answer ? { side: pending.side_answer, chat: chat.label, share: chat.share, total: chat.total } : null,
    };
  }

  const judged = turns.filter((t) => t.result !== null);
  const lastTurn = judged.at(-1) ?? null;
  const lastOutcome = lastTurn?.answer?.outcome;
  const undoable = turns.filter((t) => t.result !== null && t.kind !== "last_steal").at(-1);
  const canUndo = game.status === "playing" && !!undoable?.answer?.before && now - Date.parse(undoable.answer.judgedAt ?? "") <= UNDO_MS
    && !turns.some((t) => t.result !== null && orderOf(t) > orderOf(undoable));
  const s1 = sides.get(1)?.score ?? 0;
  const s2 = sides.get(2)?.score ?? 0;
  const controlStrikes = game.control_team ? sides.get(game.control_team)?.strikes ?? 0 : 0;

  const versus: VersusView = {
    round: index,
    rounds: game.board_ids.length,
    double: roundMultiplier(index, game.board_ids.length) > 1,
    sides: PLAYER_SIDES.map((t) => {
      const s = sides.get(t);
      return { team: t, name: s?.name ?? `Side ${t}`, score: s?.score ?? 0, strikes: s?.strikes ?? 0, members: s?.members ?? [], inControl: game.control_team === t };
    }),
    chat: { score: sides.get(CHAT_SIDE)?.score ?? 0, advisor: game.chat_advisor, lastSteal: game.chat_last_steal },
    phase,
    pot: potOf(reveals),
    faceoff: [faceoffPlayer(sides.get(1), index, game.mode), faceoffPlayer(sides.get(2), index, game.mode)],
    turn,
    last: lastTurn && lastOutcome
      ? {
          who: sideName(sides, lastTurn.team), label: lastOutcome.result === "empty" ? null : lastOutcome.label, result: lastOutcome.result,
          rank: lastOutcome.result === "hit" ? lastOutcome.rank : null, already: lastOutcome.result === "miss" && lastOutcome.reason === "already",
          kind: lastTurn.kind, trusted: lastTurn.trusted, at: lastTurn.answer?.judgedAt ?? lastTurn.closed_at ?? lastTurn.opens_at,
        }
      : null,
    canUndo,
    winner: game.status === "playing" ? null : s1 === s2 ? 0 : s1 > s2 ? 1 : 2,
  };

  const live = turn && (turn.state === "open" || turn.state === "chat");
  return {
    id: game.id,
    mode: game.mode === "teams" ? "teams" : "versus",
    status: game.status,
    boardIndex: index,
    boardCount: game.board_ids.length,
    question: board.question,
    slots: board.answers.map((a) => {
      const r = byRank.get(a.rank);
      return { rank: a.rank, label: r ? a.label : null, points: r ? a.points : null, found: !!r && r.team !== null, by: r?.team ?? null };
    }),
    strikes: controlStrikes,
    score: 0,
    seconds: game.window_seconds,
    phase: game.status !== "playing" ? "done" : banked ? "board_done" : live ? "guessing" : "pause",
    window: turn && turn.state !== "waiting" && turn.state !== "advisor" ? { opensAt: turn.opensAt, closesAt: turn.closesAt, guesses: turn.guesses } : null,
    last: null,
    leaning: lean,
    playalong,
    canOverrule: false,
    familySafe: game.family_safe,
    versus,
  };
}

/** What `!cb` says during a 1v1 or Teams game. */
export async function versusStatusLine(game: GameRow): Promise<string> {
  const view = await versusView(game);
  const v = view?.versus;
  if (!view || !v) return "🧠 Chat Brain: play along with !a <your answer>.";
  const scores = v.sides.map((s) => `${s.name} ${s.score}`).join(" · ");
  const control = v.sides.find((s) => s.inControl);
  const where = v.phase === "faceoff" ? `face-off: ${v.faceoff[0]} vs ${v.faceoff[1]}`
    : v.phase === "control" && control ? `${control.name} in control (${control.strikes} strike${control.strikes === 1 ? "" : "s"})`
    : v.phase === "steal" ? `${v.turn?.side ?? "the other side"} can steal`
    : v.phase === "last_steal" ? "chat's last steal: answer with !a"
    : v.phase === "round_done" ? "round over" : v.phase === "done" ? "game over" : "the host picks who plays";
  return `🧠 Chat Brain, round ${v.round + 1} of ${v.rounds}: ${view.question}  ·  ${scores}  ·  ${where}  ·  play along with !a <your answer>`.slice(0, 480);
}
