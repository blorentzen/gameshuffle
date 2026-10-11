/**
 * Roll Call: the game on stream's own randomizer rolls three options for the
 * streamer's next pick (a Mario Kart combo, a Smash fighter, a hero…), and
 * chat calls which one it'll land on. The randomizer's choice is made when the
 * round opens and kept private until the reveal; everyone who called it
 * scores. The pick is the streamer's for the first game back.
 *
 * Only plays when the game on stream is one GameShuffle rolls for.
 */

import "server-only";
import { getChatGame } from "@/lib/twitch/chatGames";
import type { BreakGame } from "./common";
import { chatLine, count, rightAwards, tally } from "./common";

export const rollCall: BreakGame = {
  id: "roll-call",
  make: (ctx) => {
    const game = ctx.gameOnStream ? getChatGame(ctx.gameOnStream) : null;
    if (!game) return null;
    const rolls = [];
    const taken: string[] = [];
    for (let i = 0; i < 12 && rolls.length < 3; i += 1) {
      const roll = game.roll({ owned: null, arg: "", taken });
      const first = roll.slots[0]?.name;
      if (!first || taken.includes(first)) continue;
      taken.push(first);
      rolls.push(roll);
    }
    if (rolls.length < 2) return null;
    const pick = Math.floor(ctx.rand() * rolls.length);
    const noun = game.noun ?? "pick";
    return {
      key: null,
      round: {
        layout: "choice",
        prompt: `The randomizer is rolling ${ctx.streamer}'s next ${noun}. Which one will it land on?`,
        options: rolls.map((r, i) => ({
          key: String(i + 1),
          label: r.slots[0].name,
          img: r.slots[0].img ?? null,
          sub: r.slots.slice(1, 4).map((s) => s.name).join(" · ") || r.slots[0].detail || null,
        })),
        hint: `Type 1 to ${rolls.length}`,
        tag: game.title,
      },
      secret: { correct: String(pick + 1), label: rolls[pick].slots[0].name, text: rolls[pick].text, noun },
    };
  },
  accept: (text, round) => {
    const m = text.trim().match(/^#?([1-3])\.?$/);
    return m && round.layout === "choice" && Number(m[1]) <= round.options.length ? m[1] : null;
  },
  judge: ({ secret }, answers) => {
    const correct = String(secret.correct);
    const counts = count(answers);
    const right = counts[correct] ?? 0;
    // The roll's own chat text (emoji and all), trimmed of its title if it has one.
    const said = String(secret.text).split(": ").slice(-1)[0];
    return {
      awards: rightAwards(answers, new Set([correct]), 2),
      reveal: { text: `The randomizer picked ${secret.label}. It's the next ${secret.noun}.`, correct: [correct], counts, answered: answers.length, right },
      line: chatLine(`Roll Call: the randomizer picked ${said}. ${tally(right, answers.length)}.`),
      meta: { nextPick: said },
    };
  },
};
