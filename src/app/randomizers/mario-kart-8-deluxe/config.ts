import type { GameConfig } from "@/data/types";

export const mk8dxConfig: GameConfig = {
  slug: "mario-kart-8-deluxe",
  title: "Mario Kart 8 Deluxe Kart and Track Randomizer",
  maxPlayers: 12,
  hasWeightFilter: true,
  hasDriftFilter: true,
  hasTrackTypeFilter: true,
  showCupIcons: true,
};

export const mk8dxHero = {
  videoSrc: "/video/mk8dx-randomizer-vid.mp4",
  videoWebm: "/video/mk8dx-randomizer-vid.webm",
  videoPoster: "/video/mk8dx-randomizer-vid-thumb.jpg",
  backgroundImage: "/images/bg/MK8DX_Background_Music.jpg",
};

export const mk8dxSeo = {
  title: "Mario Kart 8 Deluxe Kart and Track Randomizer",
  description:
    "Add and remove players joining the game, randomize all or one of your karts, and randomize your track selections all in one place.",
  ogImage: "/images/opengraph/gs-mk8dx-og.jpg",
  canonical: "https://gameshuffle.co/randomizers/mario-kart-8-deluxe",
  // Capture SEO from the old URL
  keywords: [
    "mario kart 8 deluxe randomizer",
    "mk8dx randomizer",
    "mario kart randomizer",
    "mario kart 8 deluxe kart randomizer",
    "mario kart track randomizer",
  ],
};
