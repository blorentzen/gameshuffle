/**
 * Trivia: questions from the GameShuffle trivia pack (src/data/originals/
 * trivia-pack.ts), only the ones staff approved in Platform ▸ Trivia. Typed
 * answers are judged like a trivia night (src/lib/trivia/rules.ts: the
 * answer line's accepts, rejects and typos); a question with choices takes A
 * to D. "Ask the host" answers count as wrong: nobody's there to rule. Picture
 * questions stay out (the file name can give the answer away), and so do the
 * game packs' questions: Game Trivia asks those, about the game on stream.
 * Skips itself until the pack is approved.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { readAllPages } from "@/lib/supabase/pages";
import { judgeAnswer, type TriviaQuestion } from "@/lib/trivia/rules";
import { categoryInSeason } from "@/lib/trivia/seasons";
import type { BreakGame } from "./common";
import { chatLine, tally } from "./common";
import { typedAnswer } from "./names";

interface PackRow { id: string; prompt: string; answer: string; accept: string[]; ask_about: string[]; reject: string[]; kind: "text" | "number" | "choice"; options: string[] | null; category: string }

const LETTERS = ["A", "B", "C", "D"];

export const triviaRounds: BreakGame = {
  id: "trivia-rounds",
  load: async () => {
    const read = (games: boolean) => readAllPages<PackRow>((from, to) => {
      const q = createServiceClient()
        .from("trivia_questions")
        .select("id, prompt, answer, accept, ask_about, reject, kind, options, category")
        .is("owner_user_id", null)
        .eq("status", "approved")
        .eq("family_safe", true)
        .in("kind", ["text", "number", "choice"]);
      return (games ? q : q.is("game_slug", null)).order("id").range(from, to);
    });
    let { data, error } = await read(false);
    // Before trivia-game-packs-m1.sql there's no game_slug to leave out.
    if (error && /game_slug/.test(error.message)) ({ data, error } = await read(true));
    if (error) return null;
    const rows = (data ?? []) as PackRow[];
    return rows.length ? rows : null;
  },
  make: (ctx) => {
    const rows = (ctx.data as PackRow[] | undefined) ?? [];
    const fresh = rows.filter((r) => !ctx.skip(`trivia:${r.id}`) && categoryInSeason(r.category) && (r.kind !== "choice" || (r.options?.length ?? 0) >= 2));
    if (!fresh.length) return null;
    const q = fresh[Math.floor(ctx.rand() * fresh.length)];
    const secret = { q: { prompt: q.prompt, answer: q.answer, accept: q.accept ?? [], askAbout: q.ask_about ?? [], reject: q.reject ?? [], kind: q.kind, options: q.options } satisfies TriviaQuestion };
    if (q.kind === "choice" && q.options) {
      const options = q.options.slice(0, 4).map((o, i) => ({ key: LETTERS[i], label: o }));
      return { key: `trivia:${q.id}`, round: { layout: "choice", prompt: q.prompt, options, hint: `Type ${LETTERS.slice(0, options.length).join(", ")}`, tag: q.category }, secret };
    }
    return {
      key: `trivia:${q.id}`,
      round: { layout: "text", prompt: q.prompt, hint: q.kind === "number" ? "Type a number" : "Type your answer", tag: q.category },
      secret,
    };
  },
  accept: (text, round) => {
    if (round.layout === "choice") {
      const t = text.trim().toUpperCase().replace(/[.)!]$/, "");
      return round.options.some((o) => o.key === t) ? t : null;
    }
    // Words, a number for a number question ("1492", "64"), or one letter (an answer can be "C"; W, L and F are chat reactions).
    const t = text.trim();
    if (/^[a-z0-9]$/i.test(t)) return /^[wlf]$/i.test(t) ? null : t;
    return typedAnswer(t, 40) ?? (/^-?\d[\d,.]{0,12}$/.test(t) ? t : null);
  },
  judge: ({ round, secret }, answers) => {
    const q = secret.q as TriviaQuestion;
    // A letter for a choice question; the judge reads letters or text.
    const right = answers.filter((a) => judgeAnswer(round.layout === "choice" ? a.answer.toLowerCase() : a.answer, q) === "correct");
    const shown = q.kind === "choice" && q.options ? `${LETTERS[q.options.findIndex((o) => o === q.answer)] ?? ""} ${q.answer}`.trim() : q.answer;
    const correctKey = q.kind === "choice" && q.options ? LETTERS[q.options.findIndex((o) => o === q.answer)] : undefined;
    return {
      awards: right.map((a) => ({ platform: a.platform, viewer: a.viewer, name: a.name, points: 1 })),
      reveal: {
        text: `The answer: ${shown}.`,
        ...(correctKey ? { correct: [correctKey] } : {}),
        answered: answers.length,
        right: right.length,
        word: q.answer,
      },
      line: chatLine(`Trivia: the answer was ${q.answer}. ${tally(right.length, answers.length)}.`),
    };
  },
};
