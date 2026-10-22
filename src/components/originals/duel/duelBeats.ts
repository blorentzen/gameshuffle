/**
 * The Daily Duel's beats (client-safe, no React): the pictures to draw between two states of the
 * field the server sent, so an exchange plays one hit at a time instead of all at once.
 *
 *   1. your move: its name shows on your hologram, its damage pops on theirs, their HP drains
 *      (a knockout drops their card; a swap brings your card in);
 *   2. their next card comes out, when yours knocked one out;
 *   3. their reply: the same, the other way (or "Asleep" when their card skips its move);
 *   4. the end of the exchange, exactly as the server sent it: the sandstorm, the new turn's
 *      event and forecast, the next card to pick or the end of the duel.
 *
 * Beats are rebuilt from the earlier picture and the exchange's log lines (damage, knockouts,
 * who came out), so the last frame is always the server's own copy. The scoreline fills in as the
 * beats go (`reveal`: how many log lines are showing). Reduced motion gets the last frame only.
 */

import type { DuelCardView, DuelLogLine, DuelPlayView } from "@/lib/originals/duel/view";
import type { EnergyType } from "@/lib/originals/duel/types";
import type { HoloMotion } from "./DuelHolo";
import { reducedMotion } from "./duelLook";

/** How long a beat holds, and a knockout's (its drop plays 0.8s). */
export const BEAT_MS = 650;
export const KO_BEAT_MS = 850;

/** What shows over a hologram for one beat: the move's name on the attacker, the damage on the card hit. */
export interface HoloFx {
  tag?: string;
  pop?: { damage: number; weak: boolean };
}

export interface ArenaMotion {
  you: HoloMotion;
  foe: HoloMotion;
  /** New for each picture (restarts the hologram's animation). */
  nonce: number;
  /** The same for every picture of one exchange (keeps the scoreline's rows in place as they appear). */
  beatKey: string;
  fx?: { you?: HoloFx; foe?: HoloFx };
  /** Log lines showing so far; undefined = all of them (the last picture). */
  reveal?: number;
}

export interface Frame {
  play: DuelPlayView;
  motion: ArenaMotion;
  /** How long this picture holds before the next one. */
  ms: number;
}

const ENERGY_WORD = /^(\w+) Energy goes on|gets (\w+) Energy\.$/;
const energyOf = (l: DuelLogLine): EnergyType | null => l.type ?? ((l.text.match(ENERGY_WORD)?.slice(1).find(Boolean) as EnergyType | undefined) ?? null);
const MOVE_NAME = /used (.+?): \d+/;
const moveOf = (l: DuelLogLine) => l.move ?? l.text.match(MOVE_NAME)?.[1] ?? "";

const copyCards = (cards: readonly DuelCardView[]) => cards.map((c) => ({ ...c, energy: c.energy.slice() }));

/** How a card on the field changed between two pictures: a new card summons, lost HP shakes. */
function motionFor(before: DuelPlayView, after: DuelPlayView, side: "you" | "foe"): HoloMotion {
  const bi = side === "you" ? before.yi : before.fi;
  const ai = side === "you" ? after.yi : after.fi;
  const cards = side === "you" ? after.you : after.foe;
  if (ai < 0 || (side === "you" && after.needsNext)) return null;
  if (!cards[ai] || cards[ai].out) return null;
  const wasThere = bi === ai && !(side === "you" && before.needsNext) && bi >= 0 && !(side === "you" ? before.you : before.foe)[bi]?.out;
  if (!wasThere) return "summon";
  const was = (side === "you" ? before.you : before.foe)[bi].cur;
  return cards[ai].cur < was ? "hit" : null;
}

/**
 * The pictures to draw between two states of the field. The first shows straight away; each
 * holds its `ms`, and the last is `next` itself. `beatKey` is shared by the exchange's pictures.
 */
export function framesBetween(prev: DuelPlayView | null, next: DuelPlayView, nonce: number, opts: { quiet?: boolean } = {}): Frame[] {
  const beatKey = `${next.turn}-${next.log.length}-${nonce}`;
  if (!prev) return [{ play: next, motion: { foe: "summon", you: next.yi >= 0 && !next.needsNext ? "summon" : null, nonce, beatKey }, ms: 0 }];
  const last = (from: DuelPlayView, n: number): Frame => ({ play: next, motion: { foe: motionFor(from, next, "foe"), you: motionFor(from, next, "you"), nonce: n, beatKey }, ms: 0 });
  const log = next.log;
  // Only an exchange (your turn, then theirs) has beats; a card sent out, a quiet refresh or
  // reduced motion goes straight to the end.
  const exchange = log[0]?.kind === "energy" && log[0].side === "you";
  if (opts.quiet) return [{ play: next, motion: { foe: null, you: null, nonce, beatKey }, ms: 0 }];
  if (!exchange || reducedMotion()) return [last(prev, nonce)];

  // The board as it stands before the exchange, with every control off.
  const b: DuelPlayView = {
    ...prev,
    you: copyCards(prev.you),
    foe: copyCards(prev.foe),
    attachTo: [], swaps: [], canMove: false, needsNext: false, nexts: [],
    energy: { now: null, next: prev.energy.next },
    event: null, advice: null, over: null,
    forecast: next.forecast,
    log,
  };
  const frames: Frame[] = [];
  let n = nonce;
  const snap = (motion: Omit<ArenaMotion, "nonce" | "beatKey">, reveal: number, ms: number) => {
    frames.push({ play: { ...b, you: copyCards(b.you), foe: copyCards(b.foe) }, motion: { ...motion, nonce: n++, beatKey, reveal }, ms });
  };
  const setField = (side: "you" | "foe", i: number) => {
    const cards = side === "you" ? b.you : b.foe;
    cards.forEach((c, k) => { c.field = k === i && !c.out; });
    if (side === "you") b.yi = i; else b.fi = i;
  };

  let i = 0;
  // Your Energy goes on (it shows on the card already: no beat of its own).
  for (; log[i]?.kind === "energy" && log[i].side === "you"; i++) {
    const t = energyOf(log[i]);
    const c = log[i].card != null ? b.you[log[i].card!] : null;
    if (t && c) c.energy.push(t);
  }

  // Your action.
  const mine = log[i];
  if (mine?.side === "you" && mine.kind === "move") {
    const d = mine.damage ?? 0;
    const ko = log[i + 1]?.kind === "ko" && log[i + 1].side === "foe";
    const foe = b.foe[b.fi];
    if (foe) foe.cur = ko ? 0 : Math.max(0, foe.cur - d);
    i += ko ? 2 : 1;
    snap({ you: null, foe: ko ? "ko" : d > 0 ? "hit" : null, fx: { you: { tag: moveOf(mine) }, foe: { pop: { damage: d, weak: !!mine.weak } } } }, i, ko ? KO_BEAT_MS : BEAT_MS);
    if (ko && foe) { foe.out = true; foe.field = false; foe.energy = []; }
  } else if (mine?.side === "you" && mine.kind === "swap" && mine.card != null) {
    setField("you", mine.card);
    i += 1;
    snap({ you: "summon", foe: null }, i, BEAT_MS);
  } else if (mine?.side === "you" && mine.kind === "wait") {
    i += 1;
  }

  // The duel ends on your move: the knockout above, then the end.
  if (next.over === "won") return [...frames, last(b, n)];

  // Their next card comes out.
  if (log[i]?.kind === "out" && log[i].side === "foe" && log[i].card != null) {
    setField("foe", log[i].card!);
    i += 1;
    snap({ you: null, foe: "summon" }, i, BEAT_MS);
  }

  // Their Energy (it shows on their card, no beat), then their move or a skipped one.
  for (; log[i]?.kind === "energy" && log[i].side === "foe" && log[i].ev == null; i++) {
    const t = energyOf(log[i]);
    if (t && b.foe[b.fi]) b.foe[b.fi].energy.push(t);
  }
  const theirs = log[i];
  if (theirs?.side === "foe" && theirs.kind === "move") {
    const d = theirs.damage ?? 0;
    const ko = log[i + 1]?.kind === "ko" && log[i + 1].side === "you";
    const you = b.you[b.yi];
    if (you) you.cur = ko ? 0 : Math.max(0, you.cur - d);
    i += ko ? 2 : 1;
    snap({ you: ko ? "ko" : d > 0 ? "hit" : null, foe: null, fx: { foe: { tag: moveOf(theirs) }, you: { pop: { damage: d, weak: !!theirs.weak } } } }, i, ko ? KO_BEAT_MS : BEAT_MS);
    if (ko && you) { you.out = true; you.field = false; you.energy = []; }
  } else if (theirs?.side === "foe" && theirs.kind === "skip") {
    i += 1;
    snap({ you: null, foe: null, fx: { foe: { tag: theirs.why === "stubborn" || /loafs/.test(theirs.text) ? "Stubborn" : "Asleep" } } }, i, BEAT_MS);
  }

  return [...frames, last(b, n)];
}
