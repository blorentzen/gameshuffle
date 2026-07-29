/**
 * Deck-EV preview (Spec 04 acceptance #4) — validate each deck's token_delta
 * EV is ≈ neutral or mildly-negative (a soft sink, not a faucet). Pure
 * functions over the loaded catalog; rendered by PlatformEventsTab.
 */

import { type ConsequenceRow, type Ctype, type EventRow, FANOUT_MODES } from "./types";

export function tokenMidpoint(c: ConsequenceRow): number {
  if (c.ctype !== "token_delta") return 0;
  const min = typeof c.payload.min === "number" ? c.payload.min : 0;
  const max = typeof c.payload.max === "number" ? c.payload.max : 0;
  return (min + max) / 2;
}

export interface DeckStat {
  count: number;
  totalWeight: number;
  meanTokenEV: number;
  minOutcome: number;
  maxOutcome: number;
  typeMix: Record<Ctype, number>;
  fanoutCount: number;
}

export function computeDeckStats(events: EventRow[], deck: "chaos" | "random"): DeckStat {
  const inDeck = events.filter(
    (e) => e.enabled && (e.surface === deck || e.surface === "both"),
  );
  const totalWeight = inDeck.reduce((s, e) => s + (e.weight || 0), 0);
  const weightedSum = inDeck.reduce(
    (s, e) => s + (e.weight || 0) * e.consequences.reduce((t, c) => t + tokenMidpoint(c), 0),
    0,
  );
  const typeMix: Record<Ctype, number> = { token_delta: 0, modifier: 0, challenge: 0, story: 0 };
  let minOutcome = 0;
  let maxOutcome = 0;
  let fanoutCount = 0;
  for (const e of inDeck) {
    if (FANOUT_MODES.has(e.partner_mode)) fanoutCount += 1;
    for (const c of e.consequences) {
      typeMix[c.ctype] += 1;
      if (c.ctype === "token_delta") {
        const min = typeof c.payload.min === "number" ? c.payload.min : 0;
        const max = typeof c.payload.max === "number" ? c.payload.max : 0;
        minOutcome = Math.min(minOutcome, min);
        maxOutcome = Math.max(maxOutcome, max);
      }
    }
  }
  return {
    count: inDeck.length,
    totalWeight,
    meanTokenEV: totalWeight > 0 ? weightedSum / totalWeight : 0,
    minOutcome,
    maxOutcome,
    typeMix,
    fanoutCount,
  };
}

export function evVerdict(ev: number): { label: string; cls: "ok" | "warn" | "bad" } {
  if (ev <= 0) return { label: "Sink / neutral", cls: "ok" };
  if (ev <= 5) return { label: "Slightly positive", cls: "warn" };
  return { label: "Faucet risk", cls: "bad" };
}
