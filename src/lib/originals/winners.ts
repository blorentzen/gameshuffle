/**
 * Yesterday's top 5 (Britton's picks, 2026-10-16): the rules behind the
 * morning winners video (/social/winners, WinnersStage.tsx) and the notes to
 * winners (src/lib/daily/winners.ts). Pure and client-safe.
 *
 * Only players who solved count (a miss is never celebrated), the first five
 * in the day board's order (points, then solve time), places as the board has
 * them. A daily with fewer than MIN_FINISHERS solvers is left out of the video.
 */

import { gsAddDays } from "@/lib/time/gsClock";

export const WINNERS_TOP = 5;
export const MIN_FINISHERS = 3;

/** Seconds: the intro, each daily's countdown, and the end card. */
export const WINNERS_INTRO = 2.6;
export const WINNERS_SECTION = 7;
export const WINNERS_END = 3;

export type WinnersGame = "shuffle" | "dex";

export interface WinnerRow {
  place: number;
  /** As the board shows it ("A player" for private profiles and anyone who opted out). */
  name: string;
  avatar: string | null;
  guesses: number;
  /** Solved on the last chance (or with bought help): 1 point, a gold dot. */
  saved: boolean;
  seconds: number | null;
  streak: number;
}

export interface WinnersSection {
  game: WinnersGame;
  title: string;
  number: number;
  /** The main guesses before a last chance, for the dots. */
  main: number;
  link: string;
  answer: { name: string; img?: string | null; types?: string[] };
  rows: WinnerRow[];
  /** How many solved that day. */
  finishers: number;
}

/** The board rows that make the video: solved, in board order, the first five. */
export function topFinishers<T extends { row: { points: number } }>(rows: T[]): { top: T[]; finishers: number } {
  const solved = rows.filter((r) => r.row.points > 0);
  return { top: solved.slice(0, WINNERS_TOP), finishers: solved.length };
}

/** Consecutive solved days ending on `day` (0 if `day` itself wasn't solved). */
export function streakEnding(days: Set<string>, day: string): number {
  let n = 0;
  let d = day;
  while (days.has(d) && n < 3650) { n += 1; d = gsAddDays(d, -1); }
  return n;
}

/** When each part of the video starts, for `count` dailies. */
export function winnersTimeline(count: number): { sectionAt: number[]; endAt: number; total: number } {
  const sectionAt = Array.from({ length: count }, (_, i) => WINNERS_INTRO + WINNERS_SECTION * i);
  const endAt = WINNERS_INTRO + WINNERS_SECTION * count;
  return { sectionAt, endAt, total: endAt + WINNERS_END };
}

/** Seconds into a section when a row appears: 5th first, then up to the winner, who lands last with a beat to spare. */
export function rowDelay(index: number, count: number): number {
  const fromBottom = count - 1 - index;
  return 1.3 + 0.6 * fromBottom + (index === 0 ? 0.3 : 0);
}

/** "Friday, October 16" for a Pacific day key. */
export function winnersDateLabel(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

/** The post's caption: named winners by place (hidden ones left out), the link, the tags. */
export function winnersCaption(sections: WinnersSection[]): string {
  const lines = sections.map((s) => {
    const named = s.rows.filter((r) => r.name !== "A player").map((r) => `${r.place}. ${r.name}`);
    return `${s.title} #${s.number}: ${named.length ? named.join(" · ") : "our top 5"}`;
  });
  const tags = ["#DailyPuzzle", "#GameShuffle", ...(sections.some((s) => s.game === "shuffle") ? ["#Nintendo"] : []), ...(sections.some((s) => s.game === "dex") ? ["#Pokemon"] : [])];
  return [`Congrats to yesterday's top 5! 🏆`, "", ...lines, "", "Make today's top 5 at gameshuffle.co/daily", "", tags.join(" ")].join("\n");
}
