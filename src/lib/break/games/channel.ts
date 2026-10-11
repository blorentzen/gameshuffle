/**
 * Know the Channel: questions about this channel that the streamer and their
 * mods wrote (break_channel_questions, break-mode-m2.sql), only the approved
 * ones. Typed answers are judged like a trivia night (the answer, the other
 * ways of writing it, small typos). Skips itself until the channel has
 * approved questions; nothing repeats on a channel within 30 days.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { judgeAnswer, type TriviaQuestion } from "@/lib/trivia/rules";
import type { BreakGame } from "./common";
import { chatLine } from "./common";
import { typedAnswer } from "./names";

interface Row { id: string; prompt: string; answer: string; accept: string[] | null }

function tally(right: number, answered: number): string {
  if (!answered) return "Nobody answered";
  return `${right} of ${answered} got it`;
}

export const knowTheChannel: BreakGame = {
  id: "know-the-channel",
  load: async (ctx) => {
    const { data, error } = await createServiceClient().from("break_channel_questions")
      .select("id, prompt, answer, accept").eq("community_id", ctx.communityId).eq("status", "approved").limit(300);
    if (error) return null;
    const rows = (data ?? []) as Row[];
    return rows.length ? rows : null;
  },
  make: (ctx) => {
    const rows = (ctx.data as Row[] | undefined) ?? [];
    const fresh = rows.filter((r) => !ctx.skip(`channel:${r.id}`));
    if (!fresh.length) return null;
    const q = fresh[Math.floor(ctx.rand() * fresh.length)];
    const secret = { q: { prompt: q.prompt, answer: q.answer, accept: q.accept ?? [], askAbout: [], reject: [], kind: "text", options: null } satisfies TriviaQuestion };
    return { key: `channel:${q.id}`, round: { layout: "text", prompt: q.prompt, hint: "Type your answer", tag: `Know ${ctx.streamer}` }, secret };
  },
  accept: (text) => {
    const t = text.trim();
    if (/^[a-z0-9]$/i.test(t)) return /^[wlf]$/i.test(t) ? null : t;
    return typedAnswer(t, 40) ?? (/^-?\d[\d,.]{0,12}$/.test(t) ? t : null);
  },
  judge: ({ secret }, answers) => {
    const q = secret.q as TriviaQuestion;
    const right = answers.filter((a) => judgeAnswer(a.answer, q) === "correct");
    return {
      awards: right.map((a) => ({ platform: a.platform, viewer: a.viewer, name: a.name, points: 2 })),
      reveal: { text: `The answer: ${q.answer}.`, answered: answers.length, right: right.length, word: q.answer },
      line: chatLine(`Know the Channel: it was ${q.answer}. ${tally(right.length, answers.length)}.`),
    };
  },
};
