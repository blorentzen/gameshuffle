/**
 * Chat Sets the Bounty: chat votes on a challenge for the streamer's next game
 * (three cards from src/data/originals/chat-bounties.ts, the game on stream's
 * first). If the streamer pulls it off, everyone who voted for the winning card
 * splits the bounty, paid from the streamer's monthly allowance when the
 * streamer or a Full mod marks it Done in the control room
 * (settleBreakBounty in ../store.ts).
 *
 * The amount is break_settings.bounty_tokens (break-mode-m2.sql); 0, or the
 * column not there yet, and the game skips itself. One bounty at a time: while
 * one is still open the game skips too.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { bountiesFor } from "@/data/originals/chat-bounties";
import type { BreakGame } from "./common";
import { chatLine, count, pick, rightAwards, shuffle } from "./common";

export const chatBounty: BreakGame = {
  id: "chat-bounty",
  load: async (ctx) => {
    const { data, error } = await createServiceClient().from("break_settings").select("bounty_tokens").eq("community_id", ctx.communityId).maybeSingle();
    if (error) return null;
    const tokens = Number((data as { bounty_tokens?: number | null } | null)?.bounty_tokens ?? 0);
    return tokens > 0 ? { tokens } : null;
  },
  make: (ctx) => {
    if (ctx.meta.bounty?.status === "open") return null;
    const tokens = (ctx.data as { tokens: number } | undefined)?.tokens ?? 0;
    if (tokens <= 0) return null;
    const three = shuffle(bountiesFor(ctx.gameOnStream), ctx.rand).slice(0, 3);
    const cards = three.map((b) => ({ label: b.label, text: b.text.replace("{name}", ctx.streamer) }));
    return {
      key: null,
      round: {
        layout: "choice",
        prompt: `Set ${ctx.streamer}'s bounty: ${tokens} tokens`,
        options: cards.map((c, i) => ({ key: String(i + 1), label: c.label, sub: c.text })),
        hint: `Type 1, 2 or 3. If ${ctx.streamer} pulls it off, everyone who voted for it splits the tokens.`,
      },
      secret: { cards, tokens },
    };
  },
  accept: (text) => {
    const m = text.trim().match(/^#?([1-3])\.?$/);
    return m ? m[1] : null;
  },
  judge: ({ secret }, answers) => {
    const cards = secret.cards as { label: string; text: string }[];
    const tokens = Number(secret.tokens ?? 0);
    const counts = count(answers);
    if (!answers.length) {
      return { awards: [], reveal: { text: "Nobody voted, so there's no bounty this time.", counts, answered: 0, right: 0 }, line: null };
    }
    const top = Math.max(...Object.values(counts));
    const tied = Object.keys(counts).filter((k) => counts[k] === top);
    const winner = tied.length === 1 ? tied[0] : pick(tied, Math.random);
    const card = cards[Number(winner) - 1];
    const voters = answers.filter((a) => a.answer === winner).map((a) => ({ platform: a.platform, viewer: a.viewer, name: a.name ?? "Someone" }));
    return {
      awards: rightAwards(answers, new Set([winner]), 1),
      reveal: { text: `Chat's bounty: ${card.text} ${voters.length} ${voters.length === 1 ? "viewer" : "viewers"} split ${tokens} tokens if it happens.`, correct: [winner], counts, answered: answers.length, right: voters.length },
      line: chatLine(`Chat's bounty: ${card.text} Pull it off and ${voters.length} ${voters.length === 1 ? "viewer gets" : "viewers split"} ${tokens} tokens.`),
      meta: { bounty: { label: card.label, text: card.text, tokens, voters, status: "open", setAt: new Date().toISOString() } },
    };
  },
};
