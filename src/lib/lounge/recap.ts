/**
 * The night's lounge recap (pure, client-safe): what the MMR card's recap view
 * (`/mmr/<token>?view=recap`, GS Pro) and the Discord end-of-stream post show.
 * Competitive dashboard picks, 2026-10-20.
 */

import { isEvent, standing, type MmrSource } from "@/lib/mmr/rules";
import { formatOf, type Format } from "./season";

export interface NightRecap {
  events: number;
  wins: number;
  losses: number;
  /** The number's change tonight, penalties included. */
  net: number;
  best: { place: number | null; delta: number; format: Format } | null;
  /** Divisions reached tonight, in order (only moves up). */
  newDivisions: string[];
  /** Tonight's events oldest first: a gain, a loss, or a gain to a new season peak. */
  squares: ("w" | "l" | "p")[];
  mmr: number | null;
  division: string;
}

export function nightRecap(src: Pick<MmrSource, "changes" | "since" | "steps" | "mmr" | "division">): NightRecap {
  const t0 = src.since ? Date.parse(src.since) : NaN;
  const tonight = src.changes.filter((c) => c.reason !== "Placement" && Number.isFinite(t0) && Date.parse(c.at) >= t0).reverse();
  const events = tonight.filter(isEvent);
  const before = src.changes.filter((c) => !Number.isFinite(t0) || Date.parse(c.at) < t0);
  let peak = before.reduce((m, c) => Math.max(m, c.mmr), -Infinity);
  let prev = tonight.length ? tonight[0].mmr - tonight[0].delta : src.mmr ?? 0;
  const divisionIdx = (m: number) => { let i = -1; src.steps.forEach((s, k) => { if (m >= s.at) i = k; }); return i; };
  let high = divisionIdx(prev);
  const newDivisions: string[] = [];
  const squares: NightRecap["squares"] = [];
  for (const c of tonight) {
    if (isEvent(c)) {
      squares.push(c.delta > 0 ? (c.mmr > peak ? "p" : "w") : "l");
      const idx = divisionIdx(c.mmr);
      if (idx > high && c.delta > 0) { high = idx; newDivisions.push(src.steps[idx].name); }
    }
    peak = Math.max(peak, c.mmr);
    prev = c.mmr;
  }
  const best = events.reduce<NightRecap["best"]>((b, c) => (!b || c.delta > b.delta ? { place: c.place, delta: c.delta, format: formatOf(c) } : b), null);
  return {
    events: events.length,
    wins: events.filter((c) => c.delta > 0).length,
    losses: events.filter((c) => c.delta < 0).length,
    net: tonight.reduce((n, c) => n + c.delta, 0),
    best,
    newDivisions,
    squares,
    mmr: src.mmr,
    division: standing(src.mmr, src.steps, src.division).division,
  };
}
