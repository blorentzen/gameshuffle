/**
 * The lounge chat commands' lines (pure, client-safe): `!last10`, `!tonight`, `!compare`.
 * The handlers in src/lib/twitch/commands/lounge.ts send them; scripts/test-lounge-season.ts checks them.
 */

import { fmtMmr, isEvent, placeWord, signed, type DivisionStep, type MmrChange, type MmrGame } from "@/lib/mmr/rules";
import type { LoungePlayer } from "@/lib/mmr/mkcentral";
import { formatOf } from "./season";

/** A player's lounge page path ("/lounge/Sam", with ?game= past the default game). */
export const loungePagePath = (name: string, game: MmrGame) => `/lounge/${encodeURIComponent(name)}${game === "mkworld12p" ? "" : `?game=${game}`}`;

/** The last ten events: record, net, the best one, average score. */
export function last10Line(name: string, changes: MmrChange[]): string {
  const ten = changes.filter(isEvent).slice(0, 10);
  if (!ten.length) return `🏁 ${name} has no events yet this season.`;
  const w = ten.filter((c) => c.delta > 0).length, l = ten.filter((c) => c.delta < 0).length;
  const net = ten.reduce((n, c) => n + c.delta, 0);
  const best = ten.reduce((a, c) => (c.delta > a.delta ? c : a));
  const scores = ten.map((c) => c.score).filter((s): s is number => s != null);
  const bestPlace = best.place != null ? `${placeWord(best.place)}${formatOf(best) === "FFA" ? "" : ` (${formatOf(best)})`}, ` : "";
  const avg = scores.length ? ` Average score ${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}.` : "";
  return `🏁 ${name}'s last ${ten.length}: ${w}-${l}, ${signed(net)}. Best: ${bestPlace}${signed(best.delta)}.${avg}`;
}

/** Tonight's run since `since`, and the event that moved them into a new division. */
export function tonightLine(name: string, changes: MmrChange[], since: string | null, steps: DivisionStep[]): string {
  const t0 = since ? Date.parse(since) : NaN;
  const tonight = changes.filter((c) => c.reason !== "Placement" && Number.isFinite(t0) && Date.parse(c.at) >= t0).reverse();
  const events = tonight.filter(isEvent);
  if (!events.length) return `🏁 ${name} hasn't played an event tonight yet.`;
  const w = events.filter((c) => c.delta > 0).length, l = events.filter((c) => c.delta < 0).length;
  const net = tonight.reduce((n, c) => n + c.delta, 0);
  const divisionAt = (m: number) => [...steps].reverse().find((s) => m >= s.at)?.name ?? null;
  let moved = "";
  let before = tonight[0].mmr - tonight[0].delta;
  events.forEach((c, i) => {
    const from = divisionAt(before), to = divisionAt(c.mmr);
    const rankUp = steps.findIndex((s) => s.name === to) > steps.findIndex((s) => s.name === from);
    if (to && rankUp) moved = ` Into ${to} on event ${i + 1}.`;
    before = c.mmr;
  });
  return `🏁 ${name} tonight: ${events.length} ${events.length === 1 ? "event" : "events"}, ${w}-${l}, ${signed(net)}.${moved}`;
}

/** Two players side by side: numbers, divisions, the gap and events played. */
export function compareLine(a: Pick<LoungePlayer, "name" | "mmr" | "division" | "eventsPlayed">, b: Pick<LoungePlayer, "name" | "mmr" | "division" | "eventsPlayed">): string {
  const side = (p: typeof a) => `${p.name} ${p.mmr == null ? "no MMR" : fmtMmr(p.mmr)}${p.division ? ` (${p.division})` : ""}`;
  let gap = "";
  if (a.mmr != null && b.mmr != null && a.mmr !== b.mmr) {
    const [hi, lo] = a.mmr > b.mmr ? [a, b] : [b, a];
    gap = ` ${hi.name} ${signed(hi.mmr! - lo.mmr!)}`;
    const more = hi.eventsPlayed - lo.eventsPlayed;
    gap += more > 0 ? `, played ${more} more ${more === 1 ? "event" : "events"}.` : more < 0 ? `, in ${-more} fewer ${more === -1 ? "event" : "events"}.` : ".";
  } else if (a.mmr != null && a.mmr === b.mmr) gap = " Level.";
  return `🏁 ${side(a)} vs ${side(b)}.${gap}`;
}
