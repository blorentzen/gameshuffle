import { RANDOMIZER_LANDINGS } from "@/data/randomizer-landings";
import type { GameConfig } from "@/data/types";

export const mk8dxConfig: GameConfig = {
  slug: "mario-kart-8-deluxe",
  title: "Mario Kart 8 Deluxe Randomizer",
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
  lead: RANDOMIZER_LANDINGS["mario-kart-8-deluxe"].lead,
};

