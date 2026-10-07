import type { HeroGame } from "@/lib/heroes/types";
import { gsDay } from "@/lib/time/gsClock";

/** The roster as of today: heroes with a future release date are left out until that day (Pacific). */
export function liveRoster(game: HeroGame, today: string = gsDay()): HeroGame {
  return { ...game, heroes: game.heroes.filter((h) => !h.released || h.released <= today) };
}
