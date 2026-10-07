import { GAME_ART } from "@/data/game-art";
import { RANDOMIZER_LANDINGS } from "@/data/randomizer-landings";
import type { GameConfig } from "@/data/types";

/** Mario Kart 64 (N64, on Nintendo Switch Online + Expansion Pack): characters only, no repeats, 16 tracks, 4 battle courses. */
export const mk64Config: GameConfig = {
  slug: "mario-kart-64",
  title: "Mario Kart 64 Randomizer",
  maxPlayers: 4,
  hasWeightFilter: true,
  hasDriftFilter: false,
  hasTrackTypeFilter: false,
  raceCounts: [4, 8, 12, 16],
  uniqueCharacters: true,
  noCollection: true,
  isNew: true,
  altMode: {
    tab: "Battle",
    heading: "Randomize your battle courses.",
    body: "Pick how many battles to play and let GameShuffle choose the courses.",
    button: "Randomize Battle Courses",
    counterLabel: "Courses",
    unit: "Battle",
  },
};

export const mk64Hero = {
  backgroundImage: GAME_ART["mario-kart-64"].hero.src,
  lead: RANDOMIZER_LANDINGS["mario-kart-64"].lead,
};
