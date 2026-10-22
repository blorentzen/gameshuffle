/**
 * The Monday lounge report (pure, client-safe; GS Pro, lounge night picks 2026-10-20): the week's
 * MMR change per game, events and record, the best night, division changes and the rivals met
 * most. The week is seven lounge nights, Monday to Sunday (a night runs 6am to 6am Pacific, so a
 * Sunday session past midnight still counts). The server side is src/lib/lounge/weeklyReport.ts.
 */

import { fmtMmr, isEvent, signed, standing, type DivisionStep, type MmrChange, type MmrGame } from "@/lib/mmr/rules";
import { gsAddDays } from "@/lib/time/gsClock";
import { nightOf, nights } from "./season";

export interface WeekRival { name: string; events: number; ahead: number; behind: number }

export interface WeekSummary {
  events: number;
  wins: number;
  losses: number;
  /** The number's change over the week, penalties included. */
  net: number;
  startMmr: number;
  endMmr: number;
  startDivision: string;
  endDivision: string;
  /** Divisions reached for the first time this week, in order (only moves up). */
  newDivisions: string[];
  nights: number;
  bestNight: { day: string; net: number; wins: number; losses: number } | null;
}

export interface WeekGame extends WeekSummary {
  game: MmrGame;
  label: string;
  name: string;
  /** "/lounge/Kevo". */
  page: string;
  rivals: WeekRival[];
}

export interface WeeklyReport {
  /** The Monday that starts the reported week. */
  weekOf: string;
  games: WeekGame[];
}

/** The week starting Monday `weekOf`, from a season's changes (newest first). Null without events. */
export function weekSummary(changes: MmrChange[], steps: DivisionStep[], weekOf: string): WeekSummary | null {
  const last = gsAddDays(weekOf, 6);
  const week = changes.filter((c) => c.reason !== "Placement" && nightOf(c.at) >= weekOf && nightOf(c.at) <= last);
  const events = week.filter(isEvent);
  if (!events.length) return null;
  const oldest = [...week].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id - b.id);
  const startMmr = oldest[0].mmr - oldest[0].delta;
  const endMmr = oldest[oldest.length - 1].mmr;
  const idx = (m: number) => { let i = -1; steps.forEach((s, k) => { if (m >= s.at) i = k; }); return i; };
  let high = idx(startMmr);
  const newDivisions: string[] = [];
  for (const c of oldest) {
    if (!isEvent(c) || c.delta <= 0) continue;
    const i = idx(c.mmr);
    if (i > high) { high = i; newDivisions.push(steps[i].name); }
  }
  const ns = nights(week);
  const best = ns.reduce<WeekSummary["bestNight"]>((b, n) => (!b || n.net > b.net ? { day: n.day, net: n.net, wins: n.wins, losses: n.losses } : b), null);
  return {
    events: events.length,
    wins: events.filter((c) => c.delta > 0).length,
    losses: events.filter((c) => c.delta < 0).length,
    net: week.reduce((n, c) => n + c.delta, 0),
    startMmr,
    endMmr,
    startDivision: standing(startMmr, steps).division,
    endDivision: standing(endMmr, steps).division,
    newDivisions,
    nights: ns.length,
    bestNight: best,
  };
}

const weekday = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
const shortDate = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Oct 13 to Oct 19". */
export const weekRange = (weekOf: string) => `${shortDate(weekOf)} to ${shortDate(gsAddDays(weekOf, 6))}`;

const record = (w: number, l: number) => `${w} ${w === 1 ? "win" : "wins"} and ${l} ${l === 1 ? "loss" : "losses"}`;

/** "Saber (4 events, ahead in 3)". */
export const rivalText = (r: WeekRival) => `${r.name} (${r.events} ${r.events === 1 ? "event" : "events"}, ahead in ${r.ahead})`;

/** A game's lines for the email, in order. */
export function weekGameLines(g: WeekGame): string[] {
  const lines = [
    `${signed(g.net)} MMR: ${record(g.wins, g.losses)} in ${g.events} ${g.events === 1 ? "event" : "events"} over ${g.nights} ${g.nights === 1 ? "night" : "nights"}. Now ${fmtMmr(g.endMmr)}.`,
  ];
  if (g.startDivision !== g.endDivision) lines.push(`${g.startDivision} to ${g.endDivision}${g.newDivisions.length ? ` (reached ${g.newDivisions.join(", ")})` : ""}.`);
  else if (g.newDivisions.length) lines.push(`Reached ${g.newDivisions.join(", ")} and finished in ${g.endDivision}.`);
  if (g.bestNight && g.nights > 1) lines.push(`Best night: ${weekday(g.bestNight.day)}, ${signed(g.bestNight.net)} (${g.bestNight.wins}-${g.bestNight.losses}).`);
  if (g.rivals.length) lines.push(`Met most: ${g.rivals.map(rivalText).join(", ")}.`);
  return lines;
}

/** The in-app notification's title and line. */
export function weekNotice(r: WeeklyReport): { title: string; message: string } {
  const [top, ...rest] = r.games;
  if (!top) return { title: "Your lounge week", message: "" };
  const title = rest.length ? "Your lounge week" : `Your lounge week: ${signed(top.net)}`;
  const parts = r.games.map((g) => {
    const into = g.newDivisions.length ? `, into ${g.newDivisions[g.newDivisions.length - 1]}` : "";
    return `${g.label} ${signed(g.net)}, ${g.wins}-${g.losses}${into}`;
  });
  const best = top.bestNight && top.nights > 1 ? ` Best night ${weekday(top.bestNight.day)} (${signed(top.bestNight.net)}).` : "";
  const rival = top.rivals[0] ? ` Met ${top.rivals[0].name} most (${top.rivals[0].ahead}-${top.rivals[0].behind}).` : "";
  return { title, message: `${parts.join(". ")}.${best}${rival}` };
}

/** The email's subject and body text (plain text, like the other transactional emails). */
export function weekEmail(r: WeeklyReport, opts: { name: string | null; baseUrl: string }): { subject: string; text: string } {
  const notice = weekNotice(r);
  const blocks = r.games.map((g) => [g.label, ...weekGameLines(g), `Your season: ${opts.baseUrl}${g.page}`].join("\n"));
  const text = [
    `Hi${opts.name ? ` ${opts.name}` : ""},`,
    `Your Mario Kart lounge week, ${weekRange(r.weekOf)}:`,
    ...blocks,
    `You get this report every Monday with GS Pro. To stop it, turn off "Weekly report" on your MMR card page: ${opts.baseUrl}/mmr-card`,
    "GameShuffle",
  ].join("\n\n");
  return { subject: notice.title, text };
}
