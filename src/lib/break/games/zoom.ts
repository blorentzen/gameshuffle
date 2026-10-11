/**
 * Zoomed In: an extreme close-up of a character portrait that zooms out in
 * four steps (8 seconds each). One guess each; the sooner you're right, the
 * more you score (4, 3, 2 or 1 points by the step on screen, allowing a few
 * seconds for stream delay). Our own art: Mario Kart, Mario Party, Smash,
 * Kirby, Overwatch and Marvel Rivals rosters (src/lib/originals/draft.ts),
 * the game on stream most of the time.
 */

import { draftRosters, type DraftRoster } from "@/lib/originals/draft";
import type { BreakGame } from "./common";
import { chatLine, nameOf, shuffle, tally, type Award } from "./common";
import { nameMatcher, type NameMatcher } from "./names";

export const ZOOM_STEPS = [5, 3, 1.8, 1];
export const ZOOM_STEP_SECONDS = 8;
/** Viewers see the stream a few seconds late: an answer counts for the step they could see. */
const DELAY_ALLOWANCE = 3;

/** Rosters with portraits that zoom well, and where the face sits (percent from the top). */
const FOCUS_Y: Record<string, number> = {
  "super-smash-bros-ultimate": 30,
  "mario-kart-8-deluxe": 30,
  "mario-kart-world": 30,
  "super-mario-party-jamboree": 28,
  "kirby-air-riders": 40,
  overwatch: 40,
  "marvel-rivals": 38,
};

let cached: DraftRoster[] | null = null;
export function zoomRosters(): DraftRoster[] {
  if (!cached) cached = draftRosters().filter((r) => r.slug in FOCUS_Y && r.items.some((i) => i.img));
  return cached;
}

const matchers = new Map<string, NameMatcher>();
export function rosterMatcher(slug: string): NameMatcher | null {
  if (!matchers.has(slug)) {
    const roster = draftRosters().find((r) => r.slug === slug);
    if (!roster) return null;
    matchers.set(slug, nameMatcher(roster.items.map((i) => i.name)));
  }
  return matchers.get(slug) ?? null;
}

/** The step on screen when an answer came in (0 = closest), allowing for stream delay. */
export function stepAt(answeredAt: number | undefined, openedAt: number): number {
  if (!answeredAt || !Number.isFinite(openedAt)) return ZOOM_STEPS.length - 1;
  const seen = (answeredAt - openedAt) / 1000 - DELAY_ALLOWANCE;
  return Math.min(ZOOM_STEPS.length - 1, Math.max(0, Math.floor(seen / ZOOM_STEP_SECONDS)));
}

export const zoomedIn: BreakGame = {
  id: "zoomed-in",
  oneGuess: true,
  make: (ctx) => {
    const rosters = zoomRosters();
    const onStream = rosters.find((r) => r.slug === ctx.gameOnStream);
    const order = onStream && ctx.rand() < 0.67 ? [onStream, ...shuffle(rosters.filter((r) => r !== onStream), ctx.rand)] : shuffle(rosters, ctx.rand);
    for (const roster of order) {
      const items = roster.items.filter((i) => i.img && !ctx.skip(`zoom:${roster.slug}:${i.name}`));
      if (!items.length) continue;
      const item = items[Math.floor(ctx.rand() * items.length)];
      const jitter = (n: number) => Math.round((ctx.rand() * 2 - 1) * n);
      return {
        key: `zoom:${roster.slug}:${item.name}`,
        round: {
          layout: "zoom",
          prompt: "Who's this?",
          hint: "Type the name. One guess each: the sooner, the more you score",
          img: item.img!,
          focus: { x: 50 + jitter(12), y: FOCUS_Y[roster.slug] + jitter(8) },
          steps: ZOOM_STEPS,
          stepSeconds: ZOOM_STEP_SECONDS,
          pool: roster.slug,
          tag: roster.label,
        },
        secret: { name: item.name },
      };
    }
    return null;
  },
  accept: (text, round) => (round.layout === "zoom" ? rosterMatcher(round.pool)?.match(text) ?? null : null),
  judge: ({ round, secret }, answers) => {
    const name = String(secret.name);
    const opened = Date.parse(round.openedAt ?? "");
    const right = answers.filter((a) => a.answer === name);
    const awards: Award[] = right.map((a) => ({ platform: a.platform, viewer: a.viewer, name: a.name, points: ZOOM_STEPS.length - stepAt(a.at, opened) }));
    const firstLook = awards.filter((a) => a.points === ZOOM_STEPS.length).length;
    const winners = awards
      .map((a, i) => ({ name: nameOf(right[i]), points: a.points }))
      .sort((p, q) => q.points - p.points)
      .slice(0, 5);
    const text = `It was ${name}.${firstLook ? ` ${firstLook} got it on the first look.` : ""}`;
    return {
      awards,
      reveal: { text, correct: [name], answered: answers.length, right: right.length, winners, word: name },
      line: chatLine(`Zoomed In: it was ${name}. ${tally(right.length, answers.length)}.`),
    };
  },
};
