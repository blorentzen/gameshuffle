/**
 * Handicap Vote: chat picks the streamer's handicap for the first game back,
 * from three cards. Only handicaps one person can do on stream: the Wheel of
 * Consequences cards that don't need a table (no swapping seats, no snack
 * table), reworded for a streamer. Mario Kart adds its racing handicaps when
 * a Mario Kart game is on stream.
 *
 * The most-voted card wins (a tie is settled at random); everyone who voted
 * for it scores a point. The pick shows on the break screen and in chat.
 */

import type { BreakGame } from "./common";
import { chatLine, count, pick, rightAwards, shuffle } from "./common";

const MK = new Set(["mario-kart-8-deluxe", "mario-kart-world", "mario-kart-64"]);

/** `{name}` is the streamer. Ids match the Consequences cards they come from. */
const ANY_GAME = [
  { id: "wc-h-01", label: "One hand only", text: "{name} plays the next game one-handed." },
  { id: "wc-h-03", label: "Chat picks", text: "Chat picks {name}'s character for the next game." },
  { id: "wc-h-06", label: "Standing up", text: "{name} plays the whole next game standing up." },
  { id: "wc-h-07", label: "Crossed hands", text: "{name} plays the next game with their hands crossed on the controller." },
];
const MARIO_KART = [
  { id: "wc-h-09", label: "No drifting", text: "{name} can't drift in the next race." },
  { id: "wc-h-10", label: "Heaviest kart", text: "{name} races the heaviest character and kart they can find." },
  { id: "wc-h-11", label: "Use it now", text: "{name} has to use every item the moment they get it." },
  { id: "wc-h-12", label: "Late start", text: "{name} can't accelerate until a full second after GO." },
];

export const handicapVote: BreakGame = {
  id: "handicap-vote",
  make: (ctx) => {
    const pool = ctx.gameOnStream && MK.has(ctx.gameOnStream) ? [...MARIO_KART, ...ANY_GAME] : ANY_GAME;
    const three = shuffle(pool, ctx.rand).slice(0, 3);
    return {
      key: null,
      round: {
        layout: "choice",
        prompt: `Pick ${ctx.streamer}'s handicap for the first game back`,
        options: three.map((h, i) => ({ key: String(i + 1), label: h.label, sub: h.text.replace("{name}", ctx.streamer) })),
        hint: "Type 1, 2 or 3",
      },
      secret: { cards: three.map((h) => ({ label: h.label, text: h.text.replace("{name}", ctx.streamer) })) },
    };
  },
  accept: (text) => {
    const m = text.trim().match(/^#?([1-3])\.?$/);
    return m ? m[1] : null;
  },
  judge: ({ secret }, answers) => {
    const cards = secret.cards as { label: string; text: string }[];
    const counts = count(answers);
    if (!answers.length) {
      return { awards: [], reveal: { text: "Nobody voted, so no handicap this time.", counts, answered: 0, right: 0 }, line: null };
    }
    const top = Math.max(...Object.values(counts));
    const tied = Object.keys(counts).filter((k) => counts[k] === top);
    const winner = tied.length === 1 ? tied[0] : pick(tied, Math.random);
    const card = cards[Number(winner) - 1];
    return {
      awards: rightAwards(answers, new Set([winner]), 1),
      reveal: { text: `Chat picked: ${card.text}`, correct: [winner], counts, answered: answers.length, right: counts[winner] ?? 0 },
      line: chatLine(`Handicap Vote: ${card.text}`),
      meta: { handicap: card.text },
    };
  },
};
