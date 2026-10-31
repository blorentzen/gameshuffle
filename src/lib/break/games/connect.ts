/**
 * Four in a Row: chat against GameShuffle. Each round chat votes a column
 * (1 to 7); the most votes drops chat's piece, then GameShuffle answers. Four
 * in a row across, down or diagonally wins. GameShuffle plays to win and
 * always blocks a win, but it isn't perfect, so a sharp chat can beat it.
 * Points: 1 for voting the column chat played, 5 more on the move that wins.
 */

import type { Award, BreakGame, RunMeta } from "./common";
import { chatLine, choiceKey, count, rightAwards } from "./common";

export const COLS = 7;
export const ROWS = 6;
const EMPTY = ".";
const MAX_MOVES = 21;

type C4 = NonNullable<RunMeta["c4"]>;

export const emptyBoard = () => EMPTY.repeat(COLS * ROWS);
export const openColumns = (board: string) => Array.from({ length: COLS }, (_, c) => c).filter((c) => board[c] === EMPTY);

/** Drops a piece in a column; returns the new board and the cell it landed in, or null when the column is full. */
export function drop(board: string, col: number, piece: "c" | "b"): { board: string; cell: number } | null {
  for (let r = ROWS - 1; r >= 0; r -= 1) {
    const i = r * COLS + col;
    if (board[i] === EMPTY) return { board: board.slice(0, i) + piece + board.slice(i + 1), cell: i };
  }
  return null;
}

const LINES: number[][] = (() => {
  const out: number[][] = [];
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < ROWS; r += 1) for (let c = 0; c < COLS; c += 1) for (const [dr, dc] of dirs) {
    const cells: number[] = [];
    for (let k = 0; k < 4; k += 1) {
      const rr = r + dr * k;
      const cc = c + dc * k;
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) break;
      cells.push(rr * COLS + cc);
    }
    if (cells.length === 4) out.push(cells);
  }
  return out;
})();

/** The four cells of a win for `piece`, or null. */
export function winLine(board: string, piece: "c" | "b"): number[] | null {
  return LINES.find((l) => l.every((i) => board[i] === piece)) ?? null;
}

const wins = (board: string | undefined, piece: "c" | "b") => !!board && !!winLine(board, piece);

/** GameShuffle's move: win if it can, block if it must, avoid handing chat a win, else the best-looking column with a little chance in it. */
export function botMove(board: string, rand: () => number): number {
  const open = openColumns(board);
  for (const c of open) if (wins(drop(board, c, "b")?.board, "b")) return c;
  for (const c of open) if (wins(drop(board, c, "c")?.board, "c")) return c;
  const safe = open.filter((c) => {
    const next = drop(board, c, "b")!.board;
    return !openColumns(next).some((c2) => wins(drop(next, c2, "c")?.board, "c"));
  });
  const choices = safe.length ? safe : open;
  let best = choices[0];
  let bestScore = -Infinity;
  for (const c of choices) {
    const next = drop(board, c, "b")!.board;
    let score = 3 - Math.abs(c - 3);
    for (const l of LINES) {
      const mine = l.filter((i) => next[i] === "b").length;
      const theirs = l.filter((i) => next[i] === "c").length;
      if (theirs === 0) score += mine === 3 ? 4 : mine === 2 ? 1 : 0;
      if (mine === 0 && theirs === 3) score -= 3;
    }
    score += rand() * 2.5;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

const fresh = (): C4 => ({ board: emptyBoard(), moves: 0, over: false, result: null, last: null });

export const fourInARow: BreakGame = {
  id: "four-in-a-row",
  rounds: (meta) => (meta.c4?.over ? meta.c4.moves : MAX_MOVES),
  make: (ctx) => {
    const state = ctx.fresh || !ctx.meta.c4 || ctx.meta.c4.over ? fresh() : ctx.meta.c4;
    const open = openColumns(state.board);
    if (!open.length) return null;
    return {
      key: null,
      round: {
        layout: "connect",
        prompt: state.moves === 0 ? "Chat goes first. Pick a column" : "Chat's move",
        hint: "Type a column, 1 to 7",
        board: state.board,
        options: open.map((c) => ({ key: String(c + 1), label: String(c + 1) })),
        last: state.last,
        tag: "Chat vs GameShuffle",
      },
      secret: {},
      ...(state !== ctx.meta.c4 ? { meta: { c4: state } } : {}),
    };
  },
  accept: (text, round) => {
    if (round.layout !== "connect") return null;
    const k = choiceKey(text, COLS);
    return k && round.options.some((o) => o.key === k) ? k : null;
  },
  judge: (_draft, answers, meta) => {
    const state = meta.c4 ?? fresh();
    const open = openColumns(state.board);
    const counts = count(answers);
    const top = Math.max(0, ...open.map((c) => counts[String(c + 1)] ?? 0));
    const tied = open.filter((c) => (counts[String(c + 1)] ?? 0) === top);
    // No votes: the middle-most open column.
    const chatCol = top > 0 ? tied[Math.floor(Math.random() * tied.length)] : [...open].sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3))[0];
    const afterChat = drop(state.board, chatCol, "c")!;
    let board = afterChat.board;
    let last: number | null = afterChat.cell;
    let result: C4["result"] = null;
    let line = winLine(board, "c");
    let text = `${answers.length ? "Chat" : "Nobody voted, so chat"} played column ${chatCol + 1}.`;
    if (line) {
      result = "chat";
      text = `Chat played column ${chatCol + 1} and wins!`;
    } else if (!openColumns(board).length) {
      result = "draw";
      text = `Chat played column ${chatCol + 1}. The board's full: a draw.`;
    } else {
      const botCol = botMove(board, Math.random);
      const afterBot = drop(board, botCol, "b")!;
      board = afterBot.board;
      last = afterBot.cell;
      line = winLine(board, "b");
      if (line) {
        result = "bot";
        text = `Chat played ${chatCol + 1}. GameShuffle played ${botCol + 1} and wins.`;
      } else if (!openColumns(board).length) {
        result = "draw";
        text = `Chat played ${chatCol + 1}, GameShuffle ${botCol + 1}. The board's full: a draw.`;
      } else {
        text = `Chat played ${chatCol + 1}. GameShuffle played ${botCol + 1}.`;
      }
    }
    const next: C4 = { board, moves: state.moves + 1, over: result !== null || state.moves + 1 >= MAX_MOVES, result, last };
    const voted = new Set([String(chatCol + 1)]);
    const awards: Award[] = rightAwards(answers, voted, 1 + (result === "chat" ? 5 : 0));
    const end = result === "chat" ? "Four in a Row: chat beat GameShuffle!" : result === "bot" ? "Four in a Row: GameShuffle wins this one." : result === "draw" ? "Four in a Row ends in a draw." : null;
    return {
      awards,
      reveal: { text, correct: [String(chatCol + 1)], counts, answered: answers.length, right: counts[String(chatCol + 1)] ?? 0, board, ...(line ? { winLine: line } : {}) },
      line: end ? chatLine(end) : null,
      meta: { c4: next },
    };
  },
};
