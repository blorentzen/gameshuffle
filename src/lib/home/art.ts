/**
 * A wide picture for a game (the stream tile's backdrop, a ticket's stub): its key art where we have some, else
 * null and the tile uses the box art. Server and client safe.
 */

import { GAME_ART } from "@/data/game-art";

const MORE: Record<string, string> = {
  "mario-kart-8-deluxe": "/images/fg/mk8dx-kart-selection-screen.jpg",
  "mario-kart-world": "/images/bg/mkw-main-image.jpg",
  "super-mario-party-jamboree": "https://cdn.empac.co/gameshuffle/images/mario-party-jamboree/mario-party-jamboree-hero.avif",
  "mario-party-superstars": "https://cdn.empac.co/gameshuffle/images/mario-party-superstars/mario-party-superstars-hero.jpg",
  // Our photo of cards on a table (the TCG hub's header): the box art's printed logo fought the card's own words.
  "pokemon-tcg": "https://cdn.empac.co/gameshuffle/images/standard/pokemon-cards.png",
};

export function wideArt(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return MORE[slug] ?? GAME_ART[slug]?.hero.src ?? null;
}
