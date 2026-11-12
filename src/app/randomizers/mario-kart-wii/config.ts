import { GAME_ART } from "@/data/game-art";
import { RANDOMIZER_LANDINGS } from "@/data/randomizer-landings";
import type { GameConfig } from "@/data/types";

/**
 * Mario Kart Wii (built 2026-11-11 with its game space): a character and a vehicle per player, the vehicle always
 * in the driver's size class, as in the game; 32 courses in 8 cups (the retro courses carry their console in the
 * name) and 10 battle arenas. Data in src/data/mkwii-data.json, art from scripts/pull-mkwii-art.ts.
 */
export const mkwiiConfig: GameConfig = {
  slug: "mario-kart-wii",
  title: "Mario Kart Wii Randomizer",
  maxPlayers: 12,
  hasWeightFilter: true,
  hasDriftFilter: true,
  hasTrackTypeFilter: false,
  showCupIcons: true,
  raceCounts: [4, 8, 12, 16, 32],
  noCollection: true,
  isNew: true,
  weightFilter: {
    label: "Size class",
    options: [
      { value: "Small", label: "Small" },
      { value: "Medium", label: "Medium" },
      { value: "Large", label: "Large" },
    ],
  },
  vehicleFilter: {
    label: "Vehicles",
    options: [
      { value: "Kart", label: "Karts" },
      { value: "Outside-drift bike", label: "Bikes, outside drift" },
      { value: "Inside-drift bike", label: "Bikes, inside drift" },
    ],
  },
  vehicleNote: true,
  altMode: {
    tab: "Battle",
    heading: "Randomize your battle arenas.",
    body: "Pick how many battles to play and let GameShuffle choose the arenas.",
    button: "Randomize Battle Arenas",
    counterLabel: "Arenas",
    unit: "Battle",
  },
};

export const mkwiiHero = {
  backgroundImage: GAME_ART["mario-kart-wii"].hero.src,
  lead: RANDOMIZER_LANDINGS["mario-kart-wii"]?.lead,
};
