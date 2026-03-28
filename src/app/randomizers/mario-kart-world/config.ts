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
};

export const mkworldHero = {
  videoSrc: "/video/mk8dx-randomizer-vid.mp4",
  videoWebm: "/video/mk8dx-randomizer-vid.webm",
  videoPoster: "/video/mk8dx-randomizer-vid-thumb.jpg",
  backgroundImage: "/images/bg/MK8DX_Background_Music.jpg",
};

export const mkworldSeo = {
  title: "Mario Kart World Kart and Track Randomizer",
  description:
    "Randomize your character and kart picks in Mario Kart World for up to 24 players, plus randomize tracks and knockout rallies.",
  ogImage: "/images/opengraph/gameshuffle-main-og.jpg",
  canonical: "https://gameshuffle.co/randomizers/mario-kart-world",
};
