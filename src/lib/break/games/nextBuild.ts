/**
 * Chat Picks Your Next Build: chat votes the streamer's next kart or fighter,
 * one part a round, from the Chat Draft pools (the same candidates and rules:
 * a Mario Kart combo is character, vehicle, wheels and glider; Smash is one
 * fighter). Three options a round, the most votes wins (ties at random), and
 * voters for the winner score. The finished build waits for the streamer:
 * it's on the break screen when they're back and in the "back" chat line.
 *
 * Only plays when the game on stream has a pool; otherwise the lineup moves on.
 */

import "server-only";
import { draftPool } from "@/lib/drafts/pools";
import { draftPoolInfo } from "@/lib/drafts/catalog";
import { withDefaults } from "@/lib/drafts/types";
import type { BreakGame, RunMeta } from "./common";
import { chatLine, majority, rightAwards, shuffle } from "./common";

/** The pool for each game on stream. */
const POOL_FOR_GAME: Record<string, string> = {
  "mario-kart-8-deluxe": "mk8dx:combo",
  "mario-kart-world": "mkworld:combo",
  "super-smash-bros-ultimate": "smash:fighter",
};

export const nextBuild: BreakGame = {
  id: "next-build",
  rounds: (meta) => meta.build?.slots.length ?? 1,
  make: (ctx) => {
    let state = ctx.fresh ? null : ctx.meta.build ?? null;
    let fresh: RunMeta | undefined;
    if (!state) {
      const poolId = ctx.gameOnStream ? POOL_FOR_GAME[ctx.gameOnStream] : undefined;
      const pool = poolId ? draftPool(poolId) : null;
      const info = poolId ? draftPoolInfo(poolId) : null;
      if (!pool || !info) return null;
      const rules = withDefaults(pool, null);
      state = { pool: pool.id, label: info.game, noun: info.noun, rules, slots: pool.slots(rules), picks: [] };
      fresh = { build: state, nextPick: null };
    }
    const pool = draftPool(state.pool);
    const slot = state.slots[ctx.roundOfGame - 1];
    if (!pool || !slot) return null;
    const picks = state.picks.map((p) => ({ ...p, slot: p.slot }));
    const options = shuffle(pool.candidates(slot, state.rules, picks), ctx.rand).slice(0, 3);
    if (!options.length) return null;
    return {
      key: null,
      round: {
        layout: "choice",
        prompt: `Pick ${ctx.streamer}'s ${slot.label.toLowerCase()} for the next game`,
        options: options.map((o, i) => ({ key: String(i + 1), label: o.label, sub: o.detail ?? null })),
        hint: `Type 1 to ${options.length}`,
        tag: state.label,
      },
      secret: { slot: slot.key, slotLabel: slot.label, options: options.map((o) => ({ id: o.id, label: o.label })) },
      meta: fresh,
    };
  },
  accept: (text, round) => {
    const m = text.trim().match(/^#?([1-3])\.?$/);
    return m && round.layout === "choice" && Number(m[1]) <= round.options.length ? m[1] : null;
  },
  judge: ({ secret }, answers, meta) => {
    const options = secret.options as { id: string; label: string }[];
    const keys = options.map((_, i) => String(i + 1));
    const { winner, counts } = majority(answers, keys, Math.random);
    const chosen = options[Number(winner) - 1];
    const state = meta.build;
    const picks = [...(state?.picks ?? []), { slot: String(secret.slot), id: chosen.id, label: chosen.label }];
    const done = !!state && picks.length >= state.slots.length;
    const build = picks.map((p) => p.label).join(" · ");
    const nextPick = done ? build : meta.nextPick ?? null;
    const voted = answers.length > 0;
    return {
      awards: rightAwards(answers, new Set([winner]), 1),
      reveal: {
        text: voted ? `Chat picked ${chosen.label}.${done ? ` The build: ${build}.` : ""}` : `Nobody voted, so it's ${chosen.label}.${done ? ` The build: ${build}.` : ""}`,
        correct: [winner], counts, answered: answers.length, right: counts[winner] ?? 0,
      },
      line: done ? chatLine(`Chat built the next ${state!.noun === "part" ? "combo" : state!.noun}: ${build}`) : null,
      meta: { build: state ? { ...state, picks } : null, nextPick },
    };
  },
};
