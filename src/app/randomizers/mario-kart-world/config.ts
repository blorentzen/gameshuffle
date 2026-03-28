import type { GameConfig } from "@/data/types";

export const mkworldConfig: GameConfig = {
  slug: "mario-kart-world",
  title: "Mario Kart World Kart and Track Randomizer",
  maxPlayers: 24,
  hasWeightFilter: true,
  hasDriftFilter: false,
  hasVehicleTypeFilter: true,
  hasTrackTypeFilter: false,
  hasKnockoutRallies: true,
  raceCounts: [4, 6, 8, 12, 16, 32],
};

export const mkworldHero = {
  backgroundImage: "/images/bg/mkw-randomizer-image.jpg",
};

export const mkworldSeo = {
  title: "Mario Kart World Kart and Track Randomizer",
  description:
    "Randomize your character and kart picks in Mario Kart World for up to 24 players, plus randomize tracks and knockout rallies.",
  ogImage: "/images/opengraph/gameshuffle-main-og.jpg",
  canonical: "https://gameshuffle.co/randomizers/mario-kart-world",
};
