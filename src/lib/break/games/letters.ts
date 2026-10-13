/**
 * Five Letters: chat works out a five-letter gaming word together, with its
 * category as a clue. Each round chat types guesses; the most-typed word on
 * our list is played and every letter shows: right spot, in the word, or not
 * in it. Six guesses. Points: 1 for everyone whose word was played (they
 * steered), and everyone who typed the answer in the round it was solved
 * scores 5 (guesses 1 to 2), 4 (3 to 4) or 3 (5 to 6). Our own word lists
 * (src/data/originals/five-letters.ts); never another puzzle's name.
 */

import type { Award, BreakGame, RunMeta } from "./common";
import { chatLine, count, pick } from "./common";
import { FIVE_LETTER_ANSWERS, FIVE_LETTER_GUESSES } from "@/data/originals/five-letters";

type Letters = NonNullable<RunMeta["letters"]>;

export const MAX_ROWS = 6;
const WORD = /^[a-z]{5}$/i;

/** What each letter of `guess` shows against `word`: "g" right spot, "y" elsewhere in the word, "x" not (repeats counted properly). */
export function markGuess(guess: string, word: string): string {
  const g = guess.toUpperCase();
  const w = word.toUpperCase();
  const marks = Array<string>(5).fill("x");
  const left: Record<string, number> = {};
  for (let i = 0; i < 5; i += 1) {
    if (g[i] === w[i]) marks[i] = "g";
    else left[w[i]] = (left[w[i]] ?? 0) + 1;
  }
  for (let i = 0; i < 5; i += 1) {
    if (marks[i] === "g") continue;
    if ((left[g[i]] ?? 0) > 0) { marks[i] = "y"; left[g[i]] -= 1; }
  }
  return marks.join("");
}

export const solvePoints = (row: number) => (row <= 2 ? 5 : row <= 4 ? 4 : 3);

function freshLetters(rand: () => number, skip: (key: string) => boolean): Letters | null {
  const choices = FIVE_LETTER_ANSWERS.filter((a) => !skip(`five:${a.word}`));
  if (!choices.length) return null;
  const a = pick(choices, rand);
  return { word: a.word, category: a.category, rows: [], over: false, solved: false };
}

export const fiveLetters: BreakGame = {
  id: "five-letters",
  rounds: (meta) => (meta.letters?.over ? meta.letters.rows.length || 1 : MAX_ROWS),
  make: (ctx) => {
    const state = ctx.fresh || !ctx.meta.letters || ctx.meta.letters.over ? freshLetters(ctx.rand, ctx.skip) : ctx.meta.letters;
    if (!state || state.over) return null;
    const guess = state.rows.length + 1;
    return {
      key: state.rows.length === 0 ? `five:${state.word}` : null,
      round: {
        layout: "letters",
        prompt: guess === 1 ? "A five-letter gaming word" : guess === MAX_ROWS ? "Last guess" : `Guess ${guess} of ${MAX_ROWS}`,
        hint: "Type a five-letter word",
        rows: state.rows,
        maxRows: MAX_ROWS,
        category: state.category,
      },
      secret: { word: state.word },
      ...(state !== ctx.meta.letters ? { meta: { letters: state } } : {}),
    };
  },
  accept: (text, round) => {
    if (round.layout !== "letters") return null;
    const t = text.trim().replace(/^!/, "");
    if (!WORD.test(t)) return null;
    const w = t.toUpperCase();
    return FIVE_LETTER_GUESSES.has(w) ? w : null;
  },
  judge: (draft, answers, meta) => {
    const state = meta.letters;
    const word = String(draft.secret.word ?? state?.word ?? "");
    if (!state || !word) return { awards: [], reveal: { text: "", answered: 0, right: 0 }, line: null };
    // A word already played can't be played again (it would waste a guess).
    const tried = new Set(state.rows.map((r) => r.word));
    const valid = answers.filter((a) => FIVE_LETTER_GUESSES.has(a.answer) && !tried.has(a.answer));
    const counts = count(valid);
    const keys = Object.keys(counts);
    const top = Math.max(0, ...keys.map((k) => counts[k]));
    const tied = keys.filter((k) => counts[k] === top);
    const played = tied.length ? tied[Math.floor(Math.random() * tied.length)] : null;
    const rows = played ? [...state.rows, { word: played, marks: markGuess(played, word) }] : [...state.rows, { word: "", marks: "" }];
    const solved = played === word;
    const over = solved || rows.length >= MAX_ROWS;
    const awards: Award[] = [];
    for (const a of valid) {
      let points = 0;
      if (a.answer === played) points += 1;
      if (solved && a.answer === word) points += solvePoints(rows.length);
      if (points) awards.push({ platform: a.platform, viewer: a.viewer, name: a.name, points });
    }
    const solvers = solved ? valid.filter((a) => a.answer === word).length : 0;
    let text: string;
    if (solved) text = `${word}! Solved in ${rows.length}.${solvers > 1 ? ` ${solvers} people had it.` : ""}`;
    else if (!played) text = over ? `Nobody guessed. The word was ${word}.` : "No new word on our list, so that guess is gone.";
    else text = over ? `${played} wasn't it. The word was ${word}.` : `Chat played ${played}${top > 1 ? ` (${top} votes)` : ""}.`;
    return {
      awards,
      reveal: { text, answered: valid.length, right: solvers, rows, word: over ? word : undefined, counts },
      line: over ? chatLine(solved ? `Five Letters: chat got ${word} in ${rows.length}!` : `Five Letters: the word was ${word}.`) : null,
      meta: { letters: { ...state, rows, solved, over } },
    };
  },
};
