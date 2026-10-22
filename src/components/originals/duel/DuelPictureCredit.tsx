"use client";

/**
 * The trainer picture's credit at the foot of the Daily Duel page, beside the card credits ("Bertha's
 * picture: Bertha's Warmth (Rising Rivals), illustrated by Ken Sugimori."). The duel loads in the
 * browser, so DailyDuel hands today's credit over here (setDuelCredit) and the line shows once it's
 * known; nothing shows before.
 */

import { useSyncExternalStore } from "react";

let credit: string | null = null;
const listeners = new Set<() => void>();

/** Today's credit line (null hides it). */
export function setDuelCredit(next: string | null) {
  if (next === credit) return;
  credit = next;
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

export function DuelPictureCredit({ className }: { className?: string }) {
  const line = useSyncExternalStore(subscribe, () => credit, () => null);
  if (!line) return null;
  return <p className={`duel-credits duel-credits--picture${className ? ` ${className}` : ""}`}>{line}</p>;
}
