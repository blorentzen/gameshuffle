/**
 * Chat Brain at the table (pure, client-safe): the room plays a published
 * board together, on phones in a live night or on one passed-around phone.
 *
 *   live night   everyone types an answer on their phone; when everyone's in
 *                (or the host locks it) the room's answer is the biggest group,
 *                bucketed like chat's answer on stream (streamRules.chatAnswer).
 *                A hidden answer banks its points; anything else is a strike.
 *                Three strikes or a cleared board ends the board.
 *   one phone    the table agrees out loud and types one answer (the whole
 *                table as one team), or two teams take turns: the team in
 *                control answers until it clears the board or takes three
 *                strikes, then the other team gets one answer to steal the
 *                points found so far.
 *
 * The table wins a shared game by banking at least half the points on offer
 * (50 a board: every board's answers total 100).
 */

import { normalize, type BoardAnswer } from "./rules";
import { STRIKES_PER_BOARD, chatAnswer, outcomeFor, type ChatAnswer, type StreamGuess, type WindowOutcome } from "./streamRules";

export const TABLE_STRIKES = STRIKES_PER_BOARD;
/** Points to bank per board for the table to win. Boards total 100, so half of what's on offer. */
export const TABLE_TARGET_PER_BOARD = 50;
/** Boards in a one-phone game, everyone as one team. */
export const TABLE_BOARD_CHOICES = [1, 3, 5] as const;
/** Boards in a one-phone teams game: even, so each team leads the same number. */
export const TEAMS_BOARD_CHOICES = [2, 4] as const;
export const TEAM_NAME_MAX = 20;

export const tableTarget = (boards: number) => Math.max(1, boards) * TABLE_TARGET_PER_BOARD;
export const tableWon = (total: number, boards: number) => total >= tableTarget(boards);

// ─── the live-night board (one room, many phones) ────────────────────────────

/** One board's state at a live night. `answers` never leaves the server. */
export interface TableBoard {
  boardId: string;
  question: string;
  answers: BoardAnswer[];
  revealed: number[];
  strikes: number;
  /** Points banked on this board. */
  score: number;
  /** Answers are collected per turn (1, 2, 3…). */
  turn: number;
  phase: "playing" | "done";
  last: TableTurn | null;
}

export interface TableTurn {
  turn: number;
  outcome: WindowOutcome;
  /** The room's answer and how many said it (null when nobody answered). */
  room: ChatAnswer | null;
  /** How many answered this turn. */
  answers: number;
}

export function freshTableBoard(boardId: string, question: string, answers: BoardAnswer[]): TableBoard {
  return { boardId, question, answers: [...answers].sort((a, b) => a.rank - b.rank), revealed: [], strikes: 0, score: 0, turn: 1, phase: "playing", last: null };
}

/** A player's typed answer, as the bucketing reads it. */
export function tableGuess(seat: number, raw: string, at: number): StreamGuess {
  const clean = raw.trim().replace(/\s+/g, " ").slice(0, 40);
  return { viewer: `seat:${seat}`, name: null, raw: clean, normalized: normalize(clean), at };
}

/** Close a turn: the room's answer hits (bank it) or it's a strike; the board ends on a clear or three strikes. */
export function resolveTableTurn(board: TableBoard, guesses: StreamGuess[]): TableBoard {
  if (board.phase !== "playing") return board;
  const room = chatAnswer(guesses, board.answers);
  const outcome = outcomeFor(room, board.answers, board.revealed);
  const hit = outcome.result === "hit";
  const revealed = hit ? [...board.revealed, outcome.rank] : board.revealed;
  const strikes = hit ? board.strikes : board.strikes + 1;
  const score = hit ? board.score + outcome.points : board.score;
  const done = board.answers.every((a) => revealed.includes(a.rank)) || strikes >= TABLE_STRIKES;
  return {
    ...board, revealed, strikes, score,
    turn: done ? board.turn : board.turn + 1,
    phase: done ? "done" : "playing",
    last: { turn: board.turn, outcome, room, answers: guesses.length },
  };
}

export const boardCleared = (board: Pick<TableBoard, "answers" | "revealed">) => board.answers.every((a) => board.revealed.includes(a.rank));

export interface TableSlot { rank: number; points: number; label: string | null; found: boolean }

/** The slots a phone or the TV may see: labels only once found, or every label once the board is over. */
export function tableSlots(board: TableBoard): TableSlot[] {
  return board.answers.map((a) => {
    const found = board.revealed.includes(a.rank);
    return { rank: a.rank, points: a.points, label: found || board.phase === "done" ? a.label : null, found };
  });
}

/** What the last turn said, in one line (phones and the TV). */
export function turnLine(t: TableTurn): string {
  const o = t.outcome;
  const many = t.room && t.room.count > 1 ? ` (${t.room.count} of ${t.answers} said it)` : "";
  if (o.result === "hit") return `The room said ${o.label}${many}: number ${o.rank}, ${o.points} points.`;
  if (o.result === "empty") return "Nobody answered. That's a strike.";
  return o.reason === "already" ? `The room said ${o.label} again${many}: it's already up. That's a strike.` : `The room said ${o.label}${many}: not on the board. That's a strike.`;
}

// ─── one phone (pass it around) ──────────────────────────────────────────────

export type PassMode = "table" | "teams";

/** What the server says about one typed answer. */
export type PassJudgement = { hit: { rank: number; points: number; label: string } | null; already: boolean };

export interface PassTeam { name: string; score: number }

export interface PassState {
  mode: PassMode;
  teams: PassTeam[];
  boards: number;
  /** 0-based. */
  boardNo: number;
  /** Teams: the team in control this board (they take turns leading). */
  control: number;
  phase: "play" | "steal" | "board_done" | "done";
  /** Ranks found on this board. */
  found: number[];
  strikes: number;
  /** Points found on this board, not banked yet (teams), or banked as they're found (the table). */
  pot: number;
  /** What just happened, for the screen. */
  last: { kind: "hit" | "miss" | "already" | "stole" | "held" | "cleared" | "strikes"; team: number; label: string | null; points: number } | null;
}

export function startPass(mode: PassMode, boards: number, names: string[]): PassState {
  const teams = mode === "table" ? [{ name: names[0]?.trim().slice(0, TEAM_NAME_MAX) || "The table", score: 0 }]
    : [0, 1].map((i) => ({ name: names[i]?.trim().slice(0, TEAM_NAME_MAX) || `Team ${i + 1}`, score: 0 }));
  const allowed: readonly number[] = mode === "table" ? TABLE_BOARD_CHOICES : TEAMS_BOARD_CHOICES;
  const count = allowed.includes(boards) ? boards : allowed[mode === "table" ? 1 : 0];
  return { mode, teams, boards: count, boardNo: 0, control: 0, phase: "play", found: [], strikes: 0, pot: 0, last: null };
}

const bank = (teams: PassTeam[], team: number, points: number) => teams.map((t, i) => (i === team ? { ...t, score: t.score + points } : t));

/**
 * One typed answer. `size` = how many answers the board has (to know when
 * it's cleared). The table banks each answer as it's found; a team builds a
 * pot and banks it when the board ends in its favour.
 */
export function passAnswer(s: PassState, j: PassJudgement, size: number): PassState {
  if (s.phase !== "play" && s.phase !== "steal") return s;
  const team = s.phase === "steal" ? 1 - s.control : s.control;
  if (s.phase === "steal") {
    // One answer to steal everything found so far.
    if (j.hit && !j.already && !s.found.includes(j.hit.rank)) {
      const won = s.pot + j.hit.points;
      return { ...s, teams: bank(s.teams, team, won), found: [...s.found, j.hit.rank], pot: 0, phase: "board_done", last: { kind: "stole", team, label: j.hit.label, points: won } };
    }
    return { ...s, teams: bank(s.teams, s.control, s.pot), pot: 0, phase: "board_done", last: { kind: "held", team: s.control, label: j.hit?.label ?? null, points: s.pot } };
  }
  if (j.hit && !j.already && !s.found.includes(j.hit.rank)) {
    const found = [...s.found, j.hit.rank];
    const table = s.mode === "table";
    const teams = table ? bank(s.teams, 0, j.hit.points) : s.teams;
    const pot = s.pot + j.hit.points;
    if (found.length >= size) {
      return { ...s, found, teams: table ? teams : bank(teams, team, pot), pot: 0, phase: "board_done", last: { kind: "cleared", team, label: j.hit.label, points: table ? j.hit.points : pot } };
    }
    return { ...s, found, teams, pot, last: { kind: "hit", team, label: j.hit.label, points: j.hit.points } };
  }
  const strikes = s.strikes + 1;
  const kind = j.already ? "already" as const : "miss" as const;
  if (strikes < TABLE_STRIKES) return { ...s, strikes, last: { kind, team, label: j.hit?.label ?? null, points: 0 } };
  // Three strikes: the table's board ends; in teams the other team gets one answer to steal.
  if (s.mode === "table") return { ...s, strikes, phase: "board_done", last: { kind: "strikes", team, label: j.hit?.label ?? null, points: 0 } };
  return { ...s, strikes, phase: "steal", last: { kind, team, label: j.hit?.label ?? null, points: 0 } };
}

/** The next board (teams take turns leading), or the end of the game. */
export function nextPassBoard(s: PassState): PassState {
  if (s.phase !== "board_done") return s;
  if (s.boardNo + 1 >= s.boards) return { ...s, phase: "done" };
  const boardNo = s.boardNo + 1;
  return { ...s, boardNo, control: s.mode === "teams" ? boardNo % 2 : 0, phase: "play", found: [], strikes: 0, pot: 0, last: null };
}

/** Who won a teams game (null on a tie), or whether the table reached its target. */
export function passResult(s: PassState): { kind: "table"; won: boolean; total: number; target: number } | { kind: "teams"; winner: number | null } {
  if (s.mode === "table") return { kind: "table", won: tableWon(s.teams[0].score, s.boards), total: s.teams[0].score, target: tableTarget(s.boards) };
  const [a, b] = s.teams;
  return { kind: "teams", winner: a.score === b.score ? null : a.score > b.score ? 0 : 1 };
}
