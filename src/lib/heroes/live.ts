import type { HeroGame } from "@/lib/heroes/types";

/** The roster as of today: heroes with a future release date are left out until that day (UTC). */
export function liveRoster(game: HeroGame, today: string = new Date().toISOString().slice(0, 10)): HeroGame {
  return { ...game, heroes: game.heroes.filter((h) => !h.released || h.released <= today) };
}
