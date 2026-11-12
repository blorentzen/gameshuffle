import "server-only";

/**
 * Chat Brain at the table: an activity in a live night where the room is one
 * team against published boards (rules in src/lib/chatbrain/tableRules.ts).
 * Each board is a round: the table row (seat null) holds the board, answers
 * included, and only the server reads it as-is. Every phone types an answer
 * per turn (party_votes, topic "brain:<turn>"); when everyone's in, or the host
 * locks it, the room's answer is the biggest group. The turn is claimed on the
 * row (payload->>turn) so two last answers can't score it twice.
 *
 * Boards are Chat Brain's public, family-safe boards (the Discord Activity's
 * pool: community test boards count in development), never one this night has
 * played. Staff only until Chat Brain launches (tableGate.ts). The game ends
 * as a shared result: everyone wins by banking half the points on offer.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { isBlockedText } from "@/lib/text/filter";
import { nightGame } from "@/lib/nights/games";
import { loadBrainBoard, pickBrainBoards } from "@/lib/activity/roomBrain";
import { brainTableOpenFor } from "@/lib/chatbrain/tableGate";
import {
  TABLE_STRIKES, boardCleared, freshTableBoard, resolveTableTurn, tableGuess, tableSlots, tableTarget, tableWon, turnLine,
  type TableBoard, type TableSlot,
} from "@/lib/chatbrain/tableRules";
import { PartyError, recordResults, type Loaded, type Viewer } from "@/lib/party/nights";
import { activityPlayers, type ActivityData } from "@/lib/party/activities";

export const BRAIN_TABLE_SLUG = "chat-brain";
/** Boards in one game, at most. */
const MAX_BOARDS = 10;
const topicFor = (turn: number) => `brain:${turn}`;

export type BrainTableAction =
  | { action: "cb_board" }
  | { action: "cb_answer"; text: string }
  | { action: "cb_lock" }
  | { action: "cb_finish" };

function boardRounds(l: Loaded, a: ActivityData) {
  const gameId = l.current.id;
  return a.deals.filter((d) => d.game_id === gameId && d.seat_index === null).sort((x, y) => x.round - y.round)
    .map((t) => ({ row: t, round: t.round, state: t.payload as unknown as TableBoard }));
}

/** This turn's answers: seat → text. */
function turnAnswers(l: Loaded, a: ActivityData, round: number, turn: number) {
  return a.votes.filter((v) => v.game_id === l.current.id && v.round === round && v.topic === topicFor(turn))
    .map((v) => ({ seat: v.voter_seat, text: String(v.choice.text ?? ""), at: Number(v.choice.at ?? 0) }));
}

export interface BrainTableView {
  slug: "chat-brain";
  label: string;
  ready: boolean;
  players: number[];
  totalRounds: number;
  /** Points to bank for the table to win the game it planned. */
  target: number;
  total: number;
  current: null | {
    round: number;
    question: string;
    slots: TableSlot[];
    strikes: number;
    maxStrikes: number;
    score: number;
    phase: "playing" | "done";
    turn: number;
    cleared: boolean;
    answered: number[];
    myAnswer: string | null;
    /** The last turn's result, as one line plus its rank (for the TV's highlight). */
    last: { line: string; result: "hit" | "miss" | "empty"; rank: number | null } | null;
  };
  history: { round: number; question: string; score: number; cleared: boolean }[];
  /** Set once the game's result is saved. */
  result: null | { won: boolean; total: number; target: number };
}

export function brainTableView(l: Loaded, a: ActivityData, v: Viewer): BrainTableView {
  const players = activityPlayers(l);
  const rounds = boardRounds(l, a);
  const last = rounds[rounds.length - 1] ?? null;
  const total = rounds.reduce((n, r) => n + (r.state.score ?? 0), 0);
  const planned = nightGame(l.current.game_slug)?.defaultLength ?? 3;
  const mySeat = v.seat !== null && players.includes(v.seat) ? v.seat : null;
  let current: BrainTableView["current"] = null;
  if (last) {
    const s = last.state;
    const answers = turnAnswers(l, a, last.round, s.turn);
    current = {
      round: last.round,
      question: s.question,
      slots: tableSlots(s),
      strikes: s.strikes,
      maxStrikes: TABLE_STRIKES,
      score: s.score,
      phase: s.phase,
      turn: s.turn,
      cleared: boardCleared(s),
      answered: s.phase === "playing" ? answers.map((x) => x.seat) : [],
      myAnswer: s.phase === "playing" && mySeat !== null ? answers.find((x) => x.seat === mySeat)?.text ?? null : null,
      last: s.last ? { line: turnLine(s.last), result: s.last.outcome.result, rank: s.last.outcome.result === "hit" ? s.last.outcome.rank : null } : null,
    };
  }
  const done = l.current.status === "done";
  return {
    slug: "chat-brain",
    label: nightGame(l.current.game_slug)?.label ?? "Chat Brain",
    ready: a.ready,
    players,
    totalRounds: planned,
    target: tableTarget(Math.max(planned, rounds.length)),
    total,
    current,
    history: rounds.filter((r) => r.state.phase === "done").map((r) => ({ round: r.round, question: r.state.question, score: r.state.score, cleared: boardCleared(r.state) })),
    result: done ? { won: tableWon(total, rounds.length), total, target: tableTarget(rounds.length) } : null,
  };
}

/** Score the turn once: claimed on the row, so a second caller finds the turn already moved on. */
async function resolveTurn(l: Loaded, row: { id: string; round: number }, state: TableBoard, answers: { seat: number; text: string; at: number }[]): Promise<void> {
  const next = resolveTableTurn(state, answers.map((x) => tableGuess(x.seat, x.text, x.at)));
  const patch: Record<string, unknown> = { payload: next };
  if (next.phase === "done") patch.revealed_at = new Date().toISOString();
  await createServiceClient().from("party_deals").update(patch)
    .eq("id", row.id).eq("payload->>turn", String(state.turn)).eq("payload->>phase", "playing");
}

async function freshAnswers(l: Loaded, round: number, turn: number) {
  const { data, error } = await createServiceClient().from("party_votes").select("voter_seat, choice")
    .eq("game_id", l.current.id).eq("round", round).eq("topic", topicFor(turn));
  if (error) throw new PartyError("server_error", 500);
  return ((data ?? []) as { voter_seat: number; choice: { text?: string; at?: number } }[])
    .map((v) => ({ seat: v.voter_seat, text: String(v.choice.text ?? ""), at: Number(v.choice.at ?? 0) }));
}

export async function runBrainTable(l: Loaded, v: Viewer, body: BrainTableAction, a: ActivityData): Promise<Record<string, never>> {
  const svc = createServiceClient();
  const players = activityPlayers(l);
  const rounds = boardRounds(l, a);
  const last = rounds[rounds.length - 1] ?? null;
  const hostOnly = () => { if (!v.isHost) throw new PartyError("host_only", 403); };

  switch (body.action) {
    case "cb_board": {
      hostOnly();
      if (!(await brainTableOpenFor(l.night.host_user_id))) throw new PartyError("not_open", 403);
      if (players.length < 2) throw new PartyError("need_players", 409);
      if (last && last.state.phase !== "done") throw new PartyError("round_open", 409);
      const round = (last?.round ?? 0) + 1;
      if (round > MAX_BOARDS) throw new PartyError("too_many_rounds", 409);
      // Never a board this night has already played (in this game or an earlier Chat Brain game).
      const seen = a.deals.filter((d) => d.seat_index === null && typeof d.payload.boardId === "string").map((d) => `brain:${d.payload.boardId}`);
      const [id] = await pickBrainBoards(1, seen);
      if (!id || seen.includes(`brain:${id}`)) throw new PartyError("no_boards", 409);
      const board = await loadBrainBoard(id);
      if (!board) throw new PartyError("no_boards", 409);
      const state = freshTableBoard(id, board.question, board.answers);
      const ins = await svc.from("party_deals").insert({ night_id: l.night.id, game_id: l.current.id, round, seat_index: null, payload: state });
      if (ins.error) throw new PartyError(ins.error.code === "23505" ? "stale" : "server_error", ins.error.code === "23505" ? 409 : 500);
      return {};
    }
    case "cb_answer": {
      if (v.seat === null || !players.includes(v.seat)) throw new PartyError("not_playing", 403);
      if (!last || last.state.phase !== "playing") throw new PartyError("voting_closed", 409);
      const text = String(body.text ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      if (!text) throw new PartyError("bad_guess");
      if (isBlockedText(text)) throw new PartyError("blocked_text");
      const turn = last.state.turn;
      const up = await svc.from("party_votes").upsert(
        { night_id: l.night.id, game_id: l.current.id, round: last.round, topic: topicFor(turn), voter_seat: v.seat, choice: { text, at: Date.now() } },
        { onConflict: "game_id,round,topic,voter_seat" },
      );
      if (up.error) throw new PartyError("server_error", 500);
      // Everyone's in: the room's answer counts now.
      const answers = await freshAnswers(l, last.round, turn);
      if (players.every((s) => answers.some((x) => x.seat === s))) await resolveTurn(l, { id: last.row.id, round: last.round }, last.state, answers);
      return {};
    }
    case "cb_lock": {
      hostOnly();
      if (!last || last.state.phase !== "playing") throw new PartyError("stale", 409);
      const answers = await freshAnswers(l, last.round, last.state.turn);
      if (!answers.length) throw new PartyError("no_votes", 409);
      await resolveTurn(l, { id: last.row.id, round: last.round }, last.state, answers);
      return {};
    }
    case "cb_finish": {
      hostOnly();
      if (last && last.state.phase !== "done") throw new PartyError("round_open", 409);
      if (!rounds.length) throw new PartyError("no_rounds", 409);
      const total = rounds.reduce((n, r) => n + r.state.score, 0);
      await recordResults(l, players, {}, "activity", { won: tableWon(total, rounds.length) });
      return {};
    }
  }
  throw new PartyError("bad_action");
}
