import "server-only";

/**
 * "Your games" on /home (journeys picks 2026-11-06, 7A, https://claude.ai/artifact/DqZuBnVSJFAuDSDY4Ssb11): a card per
 * game space you've joined (joining puts the space's game in your games, so it's read from `favorite_games`), each
 * with the space's pick of the day and one line of what's new. Only spaces this account can open: open ones, and every
 * space for staff while they're previewing. Empty while no space you've joined is open, and the room keeps its shelf.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { GAME_SPACES, spaceOpen, spacePath, type GameSpace } from "@/lib/games/spaces";
import { gameKey } from "@/lib/games/key";
import { spaceCounts, spaceHappening } from "@/lib/games/spaceData";
import { pickLine } from "@/lib/spaces/challenges";
import { isStaffRole } from "@/lib/subscription";
import { gsDay } from "@/lib/time/gsClock";

export interface GameCard {
  id: string;
  name: string;
  href: string;
  box: string | null;
  accent: string;
  /** "Combo of the day", "Tanooki Mario". */
  pick: { label: string; name: string } | null;
  /** One line of what's new: posts since your last visit, a stream or event, else the member count. */
  news: { text: string; fresh: boolean } | null;
}

/** The spaces this account can open (all of them for staff while spaces are previewing). */
export function visibleSpaces(role: string | null | undefined): GameSpace[] {
  const day = gsDay();
  return GAME_SPACES.filter((s) => spaceOpen(s, day) || isStaffRole(role));
}

/** The visible spaces this account has joined, in the registry's order. */
export function joinedSpaces(favorites: string[], role: string | null | undefined): GameSpace[] {
  const keys = new Set(favorites.map((f) => gameKey(f)).filter((k): k is NonNullable<typeof k> => !!k));
  return visibleSpaces(role).filter((s) => s.games.some((g) => keys.has(g)));
}

/** One line of what's new in a space (also the game band on search pages). */
export async function newsFor(s: GameSpace, since: number | null): Promise<GameCard["news"]> {
  if (since) {
    const { count } = await createServiceClient().from("gs_posts").select("id", { count: "exact", head: true })
      .in("game", s.games).is("deleted_at", null).gt("created_at", new Date(since).toISOString());
    if (count) return { text: `${count} new ${count === 1 ? "post" : "posts"} since you were here`, fresh: true };
  }
  const [first] = await spaceHappening(s, 1).catch(() => []);
  if (first) return { text: first.live ? `Live: ${first.title}` : `${first.title} · ${first.kicker.replace(/ · /g, " ")}`, fresh: !!first.live };
  const { members } = await spaceCounts(s);
  return members ? { text: `${members.toLocaleString("en-US")} ${members === 1 ? "member" : "members"}`, fresh: false } : null;
}

/** Your games' cards. `since` is your last visit to the home (ms), for "since you were here". */
export async function yourGames(favorites: string[], role: string | null | undefined, since: number | null): Promise<GameCard[]> {
  return cardsFor(joinedSpaces(favorites, role), since);
}

/** Cards for any list of spaces (the /games index uses it for the ones you haven't joined). */
export async function cardsFor(spaces: GameSpace[], since: number | null): Promise<GameCard[]> {
  return Promise.all(spaces.map(async (s) => {
    const [pick, news] = await Promise.all([pickLine(s).catch(() => null), newsFor(s, since).catch(() => null)]);
    return { id: s.id, name: s.name, href: spacePath(s), box: s.box, accent: s.accent, pick: pick ? { label: pick.label, name: pick.name } : null, news };
  }));
}
