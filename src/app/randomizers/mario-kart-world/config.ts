import { RANDOMIZER_LANDINGS } from "@/data/randomizer-landings";
import type { GameConfig } from "@/data/types";

export const mkworldConfig: GameConfig = {
  slug: "mario-kart-world",
  title: "Mario Kart World Randomizer",
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
  lead: RANDOMIZER_LANDINGS["mario-kart-world"].lead,
};

