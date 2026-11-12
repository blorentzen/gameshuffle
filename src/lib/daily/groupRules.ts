/**
 * Group streaks for the dailies (co-op picks 2026-11-11), pure and client-safe:
 * like a Discord channel's solve streak, but for the people you play with on
 * the site. Free; no tokens.
 *
 *   a crew        every member of any crew in a community (src/lib/communities/crews.ts).
 *                 A day counts when at least half of them solved that daily
 *                 (rounded up), and never fewer than two people.
 *   your people   you and the people you follow. A day counts when you and at
 *                 least one of them both solved it.
 *
 * The streak runs back from today when today already counts, otherwise from
 * yesterday (still alive: today can keep it going until midnight Pacific).
 */

import { gsAddDays } from "@/lib/time/gsClock";

export const GROUP_GAMES = ["shuffle", "dex"] as const;
export type GroupGame = (typeof GROUP_GAMES)[number];
export const isGroupGame = (g: string | null | undefined): g is GroupGame => (GROUP_GAMES as readonly string[]).includes(g ?? "");

/** How far back a streak is counted. */
export const GROUP_LOOKBACK_DAYS = 90;
/** At most this many crews on an end screen. */
export const MAX_CREWS = 3;
/** Crews bigger than this count their first members only (a community-sized "crew" isn't a group). */
export const MAX_CREW_MEMBERS = 40;
/** People you follow, at most, in "your people". */
export const MAX_FOLLOWS = 200;

/** How many of a crew must solve a day for it to count: half, rounded up, at least two (and never more than the crew). */
export function crewNeeds(size: number): number {
  return Math.min(Math.max(size, 0), Math.max(2, Math.ceil(size / 2)));
}

/** Who solved each day: day → people. */
export type SolvedDays = Map<string, Set<string>>;

export function streakFrom(days: SolvedDays, counts: (who: Set<string>) => boolean, today: string, lookback = GROUP_LOOKBACK_DAYS): { streak: number; today: boolean } {
  const empty = new Set<string>();
  const todayCounts = counts(days.get(today) ?? empty);
  let n = 0;
  for (let d = todayCounts ? today : gsAddDays(today, -1); n < lookback && counts(days.get(d) ?? empty); d = gsAddDays(d, -1)) n += 1;
  return { streak: n, today: todayCounts };
}

/** Only these people's days (a crew's members, or you and your follows). */
export function daysAmong(all: SolvedDays, people: Set<string>): SolvedDays {
  const out: SolvedDays = new Map();
  for (const [day, who] of all) {
    const inGroup = new Set([...who].filter((p) => people.has(p)));
    if (inGroup.size) out.set(day, inGroup);
  }
  return out;
}

export interface GroupStreak {
  kind: "crew" | "people";
  /** The community's name, or "People you follow". */
  name: string;
  /** The crew's page. */
  href: string | null;
  /** People in the group (you included). */
  size: number;
  /** Crew: members who solved today. People: the people you follow who solved today (not you). */
  solvedToday: number;
  /** Crew: members needed for a day to count. People: 1 (one of them, with you). */
  needed: number;
  /** Whether you solved today (people: a day needs you too). */
  youSolved: boolean;
  streak: number;
  /** Today already counts toward the streak. */
  today: boolean;
}

export function crewStreak(i: { name: string; href: string | null; members: Set<string>; days: SolvedDays; today: string; me: string }): GroupStreak {
  const needed = crewNeeds(i.members.size);
  const mine = daysAmong(i.days, i.members);
  const s = streakFrom(mine, (who) => who.size >= needed, i.today);
  return {
    kind: "crew", name: i.name, href: i.href, size: i.members.size, needed,
    solvedToday: mine.get(i.today)?.size ?? 0, youSolved: !!mine.get(i.today)?.has(i.me), streak: s.streak, today: s.today,
  };
}

export function peopleStreak(i: { me: string; follows: Set<string>; days: SolvedDays; today: string }): GroupStreak {
  const group = new Set([i.me, ...i.follows]);
  const mine = daysAmong(i.days, group);
  const s = streakFrom(mine, (who) => who.has(i.me) && who.size >= 2, i.today);
  const todaySet = mine.get(i.today) ?? new Set<string>();
  return {
    kind: "people", name: "People you follow", href: null, size: group.size, needed: 1,
    solvedToday: [...todaySet].filter((p) => p !== i.me).length, youSolved: todaySet.has(i.me), streak: s.streak, today: s.today,
  };
}

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/** One plain sentence for a group: on your end screen (`own`), or on a crew's page for anyone. */
export function groupLine(g: GroupStreak, own = true): string {
  if (g.kind === "people") {
    const who = g.solvedToday === 1 ? "1 person you follow" : `${g.solvedToday} people you follow`;
    if (g.today) return `You and ${who} solved it today: ${days(g.streak)} running.`;
    if (!g.youSolved && g.streak > 0) return `Solve it today to keep your ${days(g.streak)} going with the people you follow.`;
    if (g.streak > 0) return `Nobody you follow has solved it yet today. One of them keeps your ${days(g.streak)} going.`;
    return g.youSolved ? "Nobody you follow has solved it yet today. When one of them does, your streak together starts." : "When you and someone you follow both solve it, a streak starts.";
  }
  const solved = `${g.solvedToday} of ${g.size} solved today`;
  if (g.today) return `${solved}: ${days(g.streak)} running.`;
  const more = g.needed - g.solvedToday;
  if (g.streak > 0) return `${solved}. ${more} more ${more === 1 ? "keeps" : "keep"} ${own ? "your" : "the"} ${days(g.streak)} going.`;
  return `${solved}. When ${g.needed} of ${own ? "you" : "the crew"} solve it on the same day, a streak starts.`;
}
