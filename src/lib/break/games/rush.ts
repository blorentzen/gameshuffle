/**
 * Roster Rush: chat names every character on one roster together (Mario
 * Kart, Mario Party, Smash, Kirby, Overwatch, Marvel Rivals), the game on
 * stream most of the time. Every name a viewer gets right fills the board for
 * everyone and scores them a point (up to 10); naming the whole roster gives
 * everyone who helped 5 more. Every name counts, not only the first person to
 * type it (stream delay would decide that).
 */

import { draftRosters, type DraftRoster } from "@/lib/originals/draft";
import type { BreakGame, Award } from "./common";
import { chatLine, nameOf, shuffle } from "./common";
import { rosterMatcher } from "./zoom";

const RUSH_ROSTERS = new Set([
  "mario-kart-8-deluxe", "mario-kart-world", "super-mario-party-jamboree", "super-smash-bros-ultimate", "kirby-air-riders", "overwatch", "marvel-rivals",
]);
const MAX_POINTS = 10;
const CLEAR_BONUS = 5;

let cached: DraftRoster[] | null = null;
function rushRosters(): DraftRoster[] {
  if (!cached) cached = draftRosters().filter((r) => RUSH_ROSTERS.has(r.slug) && r.items.length >= 15);
  return cached;
}

/** Longer rosters get longer: about 45 seconds plus half a second a name. */
export const rushSeconds = (total: number) => Math.round(Math.min(100, Math.max(60, 45 + total * 0.6)));

export const rosterRush: BreakGame = {
  id: "roster-rush",
  multiAnswer: true,
  liveAnswers: true,
  make: (ctx) => {
    const rosters = rushRosters();
    const onStream = rosters.find((r) => r.slug === ctx.gameOnStream);
    const order = onStream ? [onStream, ...shuffle(rosters.filter((r) => r !== onStream), ctx.rand)] : shuffle(rosters, ctx.rand);
    const roster = order.find((r) => !ctx.skip(`rush:${r.slug}`));
    if (!roster) return null;
    const total = new Set(roster.items.map((i) => i.name)).size;
    return {
      key: `rush:${roster.slug}`,
      round: { layout: "rush", prompt: `Name the ${roster.label}`, hint: "Type names, as many as you know. Every new one fills the board", total, pool: roster.slug, tag: "Roster Rush" },
      secret: { pool: roster.slug, names: [...new Set(roster.items.map((i) => i.name))] },
      seconds: rushSeconds(total),
    };
  },
  accept: (text, round) => (round.layout === "rush" ? rosterMatcher(round.pool)?.match(text) ?? null : null),
  judge: ({ secret }, answers) => {
    const names = (secret.names as string[]) ?? [];
    const found: string[] = [];
    for (const a of answers) if (names.includes(a.answer) && !found.includes(a.answer)) found.push(a.answer);
    const perViewer = new Map<string, { a: (typeof answers)[number]; n: number }>();
    for (const a of answers) {
      const k = `${a.platform}:${a.viewer}`;
      const cur = perViewer.get(k) ?? { a, n: 0 };
      cur.n += 1;
      perViewer.set(k, cur);
    }
    const cleared = names.length > 0 && found.length >= names.length;
    const awards: Award[] = [...perViewer.values()].map(({ a, n }) => ({ platform: a.platform, viewer: a.viewer, name: a.name, points: Math.min(MAX_POINTS, n) + (cleared ? CLEAR_BONUS : 0) }));
    const winners = [...perViewer.values()].sort((p, q) => q.n - p.n).slice(0, 5).map(({ a, n }) => ({ name: nameOf(a), detail: `${n} name${n === 1 ? "" : "s"}`, points: Math.min(MAX_POINTS, n) + (cleared ? CLEAR_BONUS : 0) }));
    const missed = names.filter((n) => !found.includes(n));
    const text = cleared ? `Chat named all ${names.length}!` : found.length ? `Chat named ${found.length} of ${names.length}.` : "Nobody named one.";
    return {
      awards,
      reveal: { text, answered: perViewer.size, right: perViewer.size, winners, found, missed: missed.slice(0, 12) },
      line: chatLine(`Roster Rush: ${text}${winners[0] ? ` Most names: ${winners[0].name} (${winners[0].detail}).` : ""}`),
    };
  },
};
