/**
 * Emoji Puzzle: a game told in emoji (src/data/originals/emoji-puzzles.ts).
 * Chat types the game; everyone right in the window scores. Titles are read
 * loosely (spacing, punctuation, "pacman", the puzzle's other names).
 */

import { EMOJI_PUZZLES } from "@/data/originals/emoji-puzzles";
import type { BreakGame } from "./common";
import { chatLine, pick, tally } from "./common";
import { nameMatcher, typedAnswer } from "./names";

export const emojiPuzzle: BreakGame = {
  id: "emoji-puzzle",
  make: (ctx) => {
    const fresh = EMOJI_PUZZLES.filter((p) => !ctx.skip(`emoji:${p.id}`));
    if (!fresh.length) return null;
    const p = pick(fresh, ctx.rand);
    return {
      key: `emoji:${p.id}`,
      round: { layout: "text", prompt: "Which game is this?", big: p.emoji, hint: "Type the game's name", tag: "Emoji Puzzle" },
      secret: { answer: p.answer, accept: p.accept },
    };
  },
  accept: (text) => typedAnswer(text),
  judge: ({ secret }, answers) => {
    const answer = String(secret.answer);
    const matcher = nameMatcher([answer, ...((secret.accept as string[]) ?? [])], { words: false });
    const right = answers.filter((a) => matcher.match(a.answer) !== null);
    return {
      awards: right.map((a) => ({ platform: a.platform, viewer: a.viewer, name: a.name, points: 1 })),
      reveal: { text: `It was ${answer}.`, answered: answers.length, right: right.length, word: answer },
      line: chatLine(`Emoji Puzzle: it was ${answer}. ${tally(right.length, answers.length)}.`),
    };
  },
};
