/**
 * Head-to-head between two lounge players (pure, client-safe; dashboard additions picks
 * 2026-10-20). Each player's history lists every event by its table id, so two histories
 * give every event they shared: as opponents (who finished ahead) or as teammates (the
 * team's record), with no table lookups.
 */

import { isEvent, type MmrChange } from "@/lib/mmr/rules";
import { formatOf, type Format } from "./season";

export interface Meeting {
  tableId: number;
  at: string;
  tier: string | null;
  format: Format;
  together: boolean;
  aPlace: number | null;
  bPlace: number | null;
  aDelta: number;
  bDelta: number;
}

export interface HeadToHead {
  events: number;
  opponents: { events: number; aAhead: number; bAhead: number; level: number; aNet: number; bNet: number };
  teammates: { events: number; wins: number; losses: number; net: number };
  /** Average free-for-all place in the events they shared. */
  aFfaPlace: number | null;
  bFfaPlace: number | null;
  /** Newest first. */
  meetings: Meeting[];
}

export function headToHead(a: { id: number; changes: MmrChange[] }, b: { id: number; changes: MmrChange[] }): HeadToHead {
  const bById = new Map(b.changes.filter(isEvent).map((c) => [c.id, c]));
  const meetings: Meeting[] = [];
  for (const ca of a.changes.filter(isEvent)) {
    const cb = bById.get(ca.id);
    if (!cb) continue;
    const together = (ca.partners ?? []).includes(b.id) || (cb.partners ?? []).includes(a.id);
    meetings.push({ tableId: ca.id, at: ca.at, tier: ca.tier, format: formatOf(ca), together, aPlace: ca.place, bPlace: cb.place, aDelta: ca.delta, bDelta: cb.delta });
  }
  meetings.sort((x, y) => Date.parse(y.at) - Date.parse(x.at) || y.tableId - x.tableId);
  const vs = meetings.filter((m) => !m.together);
  const tm = meetings.filter((m) => m.together);
  const ffa = vs.filter((m) => m.format === "FFA");
  const avg = (list: (number | null)[]) => { const v = list.filter((n): n is number => n != null); return v.length ? v.reduce((p, q) => p + q, 0) / v.length : null; };
  return {
    events: meetings.length,
    opponents: {
      events: vs.length,
      aAhead: vs.filter((m) => m.aPlace != null && m.bPlace != null && m.aPlace < m.bPlace).length,
      bAhead: vs.filter((m) => m.aPlace != null && m.bPlace != null && m.bPlace < m.aPlace).length,
      level: vs.filter((m) => m.aPlace != null && m.aPlace === m.bPlace).length,
      aNet: vs.reduce((n, m) => n + m.aDelta, 0),
      bNet: vs.reduce((n, m) => n + m.bDelta, 0),
    },
    teammates: { events: tm.length, wins: tm.filter((m) => m.aDelta > 0).length, losses: tm.filter((m) => m.aDelta < 0).length, net: tm.reduce((n, m) => n + m.aDelta, 0) },
    aFfaPlace: avg(ffa.map((m) => m.aPlace)),
    bFfaPlace: avg(ffa.map((m) => m.bPlace)),
    meetings,
  };
}

/** One chat line: "Sam vs Riley: 23 events together. As opponents Riley leads 10-7. Teammates 4-2. Last: Oct 18, Riley 2nd, Sam 5th." */
export function h2hLine(aName: string, bName: string, h: HeadToHead, placeWord: (n: number) => string): string {
  if (!h.events) return `🏁 ${aName} and ${bName} haven't played an event together this season.`;
  const o = h.opponents;
  const lead = o.aAhead === o.bAhead ? `level ${o.aAhead}-${o.bAhead}` : o.aAhead > o.bAhead ? `${aName} leads ${o.aAhead}-${o.bAhead}` : `${bName} leads ${o.bAhead}-${o.aAhead}`;
  const parts = [`🏁 ${aName} vs ${bName}: ${h.events} ${h.events === 1 ? "event" : "events"} together.`];
  if (o.events) parts.push(`As opponents ${lead}.`);
  if (h.teammates.events) parts.push(`Teammates ${h.teammates.wins}-${h.teammates.losses}.`);
  const last = h.meetings.find((m) => !m.together && m.aPlace != null && m.bPlace != null);
  if (last) {
    const day = new Date(last.at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
    const [first, second] = last.aPlace! <= last.bPlace! ? [[aName, last.aPlace!], [bName, last.bPlace!]] as const : [[bName, last.bPlace!], [aName, last.aPlace!]] as const;
    parts.push(`Last: ${day}, ${first[0]} ${placeWord(first[1])}, ${second[0]} ${placeWord(second[1])}.`);
  }
  return parts.join(" ");
}
