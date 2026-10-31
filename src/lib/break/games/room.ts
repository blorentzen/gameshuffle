/**
 * Read the Room: a this-or-that question (our own, src/data/originals/
 * read-the-room.ts). Chat types 1 or 2, and everyone who picked what most of
 * chat picked scores; a dead heat scores everyone.
 */

import { READ_THE_ROOM } from "@/data/originals/read-the-room";
import type { BreakGame } from "./common";
import { chatLine, choiceKey, count, pick, rightAwards } from "./common";

export const readTheRoom: BreakGame = {
  id: "read-the-room",
  make: (ctx) => {
    const fresh = READ_THE_ROOM.filter((p) => !ctx.skip(`room:${p.id}`));
    if (!fresh.length) return null;
    const p = pick(fresh, ctx.rand);
    return {
      key: `room:${p.id}`,
      round: {
        layout: "choice",
        prompt: p.q,
        options: [{ key: "1", label: p.a }, { key: "2", label: p.b }],
        hint: "Type 1 or 2: pick what most of chat picks",
        tag: "This or that",
      },
      secret: { a: p.a, b: p.b },
    };
  },
  accept: (text) => choiceKey(text, 2),
  judge: ({ secret }, answers) => {
    const counts = count(answers);
    const one = counts["1"] ?? 0;
    const two = counts["2"] ?? 0;
    const total = one + two;
    if (!total) return { awards: [], reveal: { text: "Nobody picked a side.", counts, answered: 0, right: 0 }, line: null };
    const room = one === two ? ["1", "2"] : one > two ? ["1"] : ["2"];
    const label = (k: string) => String(k === "1" ? secret.a : secret.b);
    const pct = Math.round((Math.max(one, two) / total) * 100);
    const text = one === two ? `A dead heat, ${one} each. Everyone scores.` : `${pct}% picked ${label(room[0])}.`;
    const right = room.reduce((n, k) => n + (counts[k] ?? 0), 0);
    return {
      awards: rightAwards(answers, new Set(room), 1),
      reveal: { text, correct: room, counts, answered: total, right },
      line: chatLine(`Read the Room: ${text}`),
    };
  },
};
