/**
 * Chat Brain on a break: chat answers an open Chat Brain question (the
 * public one that most needs answers, family safe). Every answer goes into
 * the question's survey under that viewer's Twitch identity (source
 * `twitch:break`) or their account (`site:break`), one per person like
 * everywhere else, so breaks help build the boards. Nobody's answer is shown
 * on screen: only how many came in. Everyone who answers scores a point.
 * Skips itself when no question is open.
 */

import "server-only";
import { promptNeedingAnswers, submitAnswer } from "@/lib/chatbrain/store";
import { resolveIdentity } from "@/lib/economy/identity";
import type { BreakGame } from "./common";
import { chatLine } from "./common";
import { typedAnswer } from "./names";

interface Question { id: string; text: string; category: string | null }

export const chatBrain: BreakGame = {
  id: "chat-brain",
  load: async (ctx) => {
    const exclude: string[] = [];
    // The neediest open question this channel hasn't been asked lately.
    for (let i = 0; i < 6; i += 1) {
      const p = await promptNeedingAnswers({ exclude }).catch(() => null);
      if (!p) return null;
      if (!ctx.skip?.(`brain:${p.id}`)) return { id: p.id, text: p.text, category: p.category ?? null } satisfies Question;
      exclude.push(p.id);
    }
    return null;
  },
  make: (ctx) => {
    const q = ctx.data as Question | undefined;
    if (!q) return null;
    return {
      key: `brain:${q.id}`,
      round: { layout: "text", prompt: q.text, hint: "Type a short answer. Your answer helps build the board", tag: "Chat Brain" },
      secret: { promptId: q.id },
    };
  },
  accept: (text) => typedAnswer(text, 32),
  judge: (draft, answers) => {
    const n = answers.length;
    return {
      awards: answers.map((a) => ({ platform: a.platform, viewer: a.viewer, name: a.name, points: 1 })),
      reveal: { text: n ? `${n} answer${n === 1 ? "" : "s"} in. Thanks, chat! The board shows up once enough people answer.` : "No answers this time.", answered: n, right: n },
      line: n ? chatLine(`Chat Brain: ${n} answer${n === 1 ? "" : "s"} in for "${draft.round.prompt.slice(0, 120)}". Thanks, chat!`) : null,
    };
  },
  persist: async ({ secret }, answers) => {
    const promptId = String(secret.promptId ?? "");
    if (!promptId) return;
    for (const a of answers) {
      try {
        if (a.platform === "site") {
          await submitAnswer({ promptId, raw: a.answer, who: { userId: a.viewer }, source: "site:break" });
        } else {
          const { identityId } = await resolveIdentity({ platform: "twitch", platformId: a.viewer, displayName: a.name });
          await submitAnswer({ promptId, raw: a.answer, who: { identityId }, source: "twitch:break" });
        }
      } catch {
        // One answer that can't be kept (already answered, blocked word) never stops the rest.
      }
    }
  },
};
