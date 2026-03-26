import type { GameConfig } from "@/data/types";

export const mkwConfig: GameConfig = {
  slug: "mario-kart-world",
  title: "Mario Kart World Kart and Track Randomizer",
  maxPlayers: 24,
  hasWeightFilter: true,
  hasDriftFilter: true,
  hasTrackTypeFilter: true,
};

export const mkwHero = {
  videoSrc: "/video/mk8dx-randomizer-vid.mp4",
  videoWebm: "/video/mk8dx-randomizer-vid.webm",
  videoPoster: "/video/mk8dx-randomizer-vid-thumb.jpg",
  backgroundImage: "/images/bg/MK8DX_Background_Music.jpg",
};

export const mkwSeo = {
  title: "Mario Kart World Kart and Track Randomizer",
  description:
    "Add and remove players joining the game, randomize all or one of your karts, and randomize your track selections all in one place.",
  ogImage: "/images/opengraph/gs-mk8dx-og.jpg",
  canonical: "https://gameshuffle.co/randomizers/mario-kart-world",
};
