/**
 * Tag team against a trainer (co-op picks 2026-11-11, pick 4, all as recommended): two players share one side of a
 * normal Trainer Road duel. Pure and client-safe, on top of the duel engine (engine.ts, unchanged): the trainer, the
 * day's six, Energy, events and par are the duel's own; this only says who plays what.
 *
 *   1. The draft: a coin decides who picks first, then the two take turns picking from the six until the duel's
 *      bring count is reached (all six on duels without one). Each card belongs to whoever picked it.
 *   2. The lead: the player who picked second leads, with one of their own cards.
 *   3. Turns: whoever owns the card on the field plays the turn (the Energy can go on any card on the side, a swap
 *      can bring in either player's card, which hands the next turn over). When a card is knocked out, its owner
 *      picks the next card, from either player's.
 *   4. The clock: a draft pick or a send-out that runs out takes the card with the most HP; a turn that runs out
 *      plays itself (the first Energy in the hand on the card on the field, then wait). Three missed turns in a row
 *      by either player lose the duel for both.
 * No professor and no tools (a duel against friends, like Duel a friend).
 */

import { applyStep, attachTargets, nexts, startState, type DuelSetup, type DuelState } from "./engine";
import type { DuelAction } from "./types";

export type TagSide = 0 | 1;
const other = (s: TagSide): TagSide => (s === 0 ? 1 : 0);
export const TAG_MISSES_LOSE = 3;

export interface TagState {
  /** The coin: who picks first in the draft (the other leads). */
  first: TagSide;
  /** Each card of the six: who picked it (null = nobody yet). */
  owner: (TagSide | null)[];
  /** The duel itself (engine state). */
  duel: DuelState;
  /** Whose card was on the field last (they pick the next after a knockout). */
  last: TagSide | null;
  missed: [number, number];
  /** Lost on missed turns (the duel's own `over` covers a normal win or loss). */
  timedOut: TagSide | null;
}

export type TagStep = { pick: number } | { next: number } | DuelAction;

/** How many cards the draft hands out: the duel's bring count, or all six. */
export const draftSize = (setup: DuelSetup) => (setup.bring && setup.bring < setup.you.length ? setup.bring : setup.you.length);

export function startTag(setup: DuelSetup, first: TagSide): TagState {
  return { first, owner: setup.you.map(() => null), duel: startState(setup), last: null, missed: [0, 0], timedOut: null };
}

const picked = (t: TagState) => t.owner.filter((o) => o != null).length;
export const drafting = (setup: DuelSetup, t: TagState) => picked(t) < draftSize(setup);
/** Whose draft pick it is: they take turns from the first picker. */
const pickerNow = (t: TagState): TagSide => (picked(t) % 2 === 0 ? t.first : other(t.first));

export type TagPhase = "draft" | "lead" | "play" | "done";
export function phaseOf(setup: DuelSetup, t: TagState): TagPhase {
  if (t.duel.over || t.timedOut != null) return "done";
  if (drafting(setup, t)) return "draft";
  if (t.duel.yi < 0) return "lead";
  return "play";
}

/** Who the duel waits on right now. */
export function waitingOn(setup: DuelSetup, t: TagState): TagSide | null {
  const ph = phaseOf(setup, t);
  if (ph === "done") return null;
  if (ph === "draft") return pickerNow(t);
  if (ph === "lead") return other(t.first);
  const s = t.duel;
  if (s.you[s.yi]?.out) return t.last ?? other(t.first);
  return t.owner[s.yi] ?? other(t.first);
}

/** The cards this player may pick, send out or lead with right now. */
export function choicesFor(setup: DuelSetup, t: TagState, me: TagSide): number[] {
  if (waitingOn(setup, t) !== me) return [];
  const ph = phaseOf(setup, t);
  if (ph === "draft") return t.owner.map((o, i) => (o == null ? i : -1)).filter((i) => i >= 0);
  if (ph === "lead") return nexts(t.duel).filter((i) => t.owner[i] === me);
  if (t.duel.you[t.duel.yi]?.out) return nexts(t.duel);
  return [];
}

/** Plays one step for player `me`. Null when it isn't theirs to make or isn't allowed. */
export function applyTag(setup: DuelSetup, t0: TagState, me: TagSide, st: TagStep): TagState | null {
  if (waitingOn(setup, t0) !== me) return null;
  const ph = phaseOf(setup, t0);
  if ("pick" in st) {
    if (ph !== "draft" || !Number.isInteger(st.pick) || t0.owner[st.pick] !== null || st.pick < 0 || st.pick >= setup.you.length) return null;
    const t: TagState = { ...t0, owner: t0.owner.slice(), missed: [t0.missed[0], t0.missed[1]] };
    t.owner[st.pick] = me;
    // Draft done: the drafted cards are the ones brought (when the duel has a bring step).
    if (!drafting(setup, t) && setup.bring && setup.bring < setup.you.length) {
      const brought = t.owner.map((o, i) => (o != null ? i : -1)).filter((i) => i >= 0);
      const d = applyStep(setup, t.duel, { bring: brought });
      if (!d) return null;
      t.duel = d;
    }
    return t;
  }
  if ("next" in st) {
    if (ph === "lead" ? t0.owner[st.next] !== me : !t0.duel.you[t0.duel.yi]?.out) return null;
    const d = applyStep(setup, t0.duel, { next: st.next });
    if (!d) return null;
    return { ...t0, duel: d, last: t0.owner[st.next] ?? me, missed: [t0.missed[0], t0.missed[1]] };
  }
  if (ph !== "play") return null;
  const d = applyStep(setup, t0.duel, st);
  if (!d) return null;
  const missed: [number, number] = [t0.missed[0], t0.missed[1]];
  missed[me] = 0;
  // Whoever owned the card on the field at the end of the turn picks the next if it was knocked out.
  return { ...t0, duel: d, last: t0.owner[d.yi] ?? me, missed };
}

/**
 * The clock ran out on whoever the duel waits on: a draft pick, a lead or a send-out takes the card with the most HP;
 * a turn plays itself (the hand's first Energy on the card on the field, then wait). The third missed turn in a row
 * loses the duel for both.
 */
export function tagTimeOut(setup: DuelSetup, t0: TagState): TagState {
  const me = waitingOn(setup, t0);
  if (me == null) return t0;
  const ph = phaseOf(setup, t0);
  const most = (cards: number[]) => cards.reduce((best, i) => (best < 0 || setup.you[i].hp > setup.you[best].hp ? i : best), -1);
  if (ph === "draft") return applyTag(setup, t0, me, { pick: most(choicesFor(setup, t0, me)) }) ?? t0;
  if (ph === "lead" || t0.duel.you[t0.duel.yi]?.out) return applyTag(setup, t0, me, { next: most(choicesFor(setup, t0, me)) }) ?? t0;
  const missed = t0.missed[me] + 1;
  if (missed >= TAG_MISSES_LOSE) return { ...t0, timedOut: me, missed: me === 0 ? [missed, t0.missed[1]] : [t0.missed[0], missed] };
  const s = t0.duel;
  const attach = attachTargets(s).includes(s.yi) ? s.yi : attachTargets(s)[0];
  const t = applyTag(setup, t0, me, { attach, act: { wait: true }, use: 0 });
  if (!t) return t0;
  t.missed[me] = missed;
  return t;
}

/** The duel's result for the team. */
export const tagResult = (t: TagState): "won" | "lost" | null => (t.timedOut != null ? "lost" : t.duel.over);

/** Replays a tag duel from its steps (who made each, or the clock). */
export function replayTag(setup: DuelSetup, first: TagSide, steps: readonly { by: TagSide | "clock"; st?: TagStep }[]): TagState | null {
  let t = startTag(setup, first);
  for (const x of steps) {
    if (x.by === "clock") t = tagTimeOut(setup, t);
    else {
      const n = x.st ? applyTag(setup, t, x.by, x.st) : null;
      if (!n) return null;
      t = n;
    }
  }
  return t;
}
