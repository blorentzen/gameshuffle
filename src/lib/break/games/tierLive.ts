/**
 * Tier War Live: chat ranks six things from one topic (our text topics and
 * every Tier List Maker template), one item a round. Chat types S, A, B, C or
 * D; the room's tier is the most common vote (a tie goes to the tier nearest
 * the average vote, then the higher one), and everyone who matched the room
 * scores. The last round shows the finished list. Same idea as the Tier Wars
 * Original at a live night, one item at a time so chat can keep up.
 */

import { TIER_TOPICS } from "@/data/originals/tier-wars";
import { TIERS } from "@/lib/originals/tierWars";
import type { BreakGame, RunMeta } from "./common";
import { chatLine, count, rightAwards, shuffle, tally } from "./common";

const ITEMS = 6;
const LETTERS = TIERS as readonly string[];

/** The room's tier: the most votes, a tie settled toward the average vote, then the higher tier. */
export function roomTier(votes: string[]): string | null {
  if (!votes.length) return null;
  const counts: Record<string, number> = {};
  for (const v of votes) counts[v] = (counts[v] ?? 0) + 1;
  const top = Math.max(...Object.values(counts));
  const tied = LETTERS.filter((t) => counts[t] === top);
  if (tied.length === 1) return tied[0];
  const avg = votes.reduce((a, v) => a + LETTERS.indexOf(v), 0) / votes.length;
  return [...tied].sort((a, b) => Math.abs(LETTERS.indexOf(a) - avg) - Math.abs(LETTERS.indexOf(b) - avg) || LETTERS.indexOf(a) - LETTERS.indexOf(b))[0];
}

export const tierWarLive: BreakGame = {
  id: "tier-war-live",
  rounds: (meta) => meta.tier?.items.length ?? ITEMS,
  make: (ctx) => {
    let state = ctx.fresh ? null : ctx.meta.tier ?? null;
    let fresh: RunMeta | undefined;
    if (!state) {
      const topics = TIER_TOPICS.filter((t) => t.items.length >= ITEMS);
      const unseen = topics.filter((t) => !ctx.skip(`tier:${t.id}`));
      const pool = unseen.length ? unseen : topics;
      if (!pool.length) return null;
      const topic = pool[Math.floor(ctx.rand() * pool.length)];
      state = { topic: topic.id, label: topic.label, items: shuffle(topic.items, ctx.rand).slice(0, ITEMS), room: {} };
      fresh = { tier: state };
    }
    const item = state.items[Math.min(ctx.roundOfGame, state.items.length) - 1];
    if (!item) return null;
    return {
      key: ctx.roundOfGame === 1 ? `tier:${state.topic}` : null,
      round: {
        layout: "choice",
        // The item shows big under the topic (with its picture when it has one).
        prompt: state.label,
        item: item.label,
        img: item.image ?? null,
        options: LETTERS.map((t) => ({ key: t, label: t })),
        hint: "Type S, A, B, C or D",
        tag: state.label,
      },
      secret: { item: item.label },
      meta: fresh,
    };
  },
  accept: (text) => {
    const t = text.trim().toUpperCase().replace(/[.!]$/, "").replace(/ ?TIER$/, "");
    return LETTERS.includes(t) ? t : null;
  },
  judge: ({ secret }, answers, meta) => {
    const item = String(secret.item);
    const tier = roomTier(answers.map((a) => a.answer));
    const state = meta.tier;
    const room = { ...(state?.room ?? {}), ...(tier ? { [item]: tier } : {}) };
    const nextState = state ? { ...state, room } : null;
    const last = !!state && Object.keys(room).length >= state.items.length;
    const counts = count(answers);
    const right = tier ? counts[tier] ?? 0 : 0;
    const tiers = last && state
      ? LETTERS.map((t) => ({ tier: t, items: state.items.map((i) => i.label).filter((label) => room[label] === t) })).filter((r) => r.items.length)
      : undefined;
    const text = tier ? `Chat put ${item} in ${tier}.` : `Nobody ranked ${item}.`;
    return {
      awards: tier ? rightAwards(answers, new Set([tier]), 1) : [],
      reveal: { text, correct: tier ? [tier] : [], counts, answered: answers.length, right, tiers },
      line: last && tiers
        ? chatLine(`Chat's tier list for ${state!.label}: ${tiers.map((r) => `${r.tier}: ${r.items.join(", ")}`).join(" · ")}`)
        : tier ? chatLine(`Tier War Live: ${item} goes in ${tier}. ${tally(right, answers.length)} with the room.`) : null,
      meta: { tier: nextState },
    };
  },
};
