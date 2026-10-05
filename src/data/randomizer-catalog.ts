/**
 * Every randomizer, grouped by series, for the /randomizers index ("All
 * randomizers"). The nav lists only the top four and links here for the rest.
 * Hidden games (src/lib/games-visibility.ts) drop out automatically.
 */

import { randomizerPublic } from "@/lib/games-visibility";
import { GAME_ART } from "@/data/game-art";

export interface CatalogEntry {
  slug: string;
  href: string;
  title: string;
  /** A shorter name for tight spots (the More game randomizers carousel). */
  short?: string;
  blurb: string;
  image?: string;
  imageAlt?: string;
  beta?: boolean;
  cta?: string;
}

export interface CatalogGroup { id: string; heading: string; entries: CatalogEntry[] }

const GROUPS: CatalogGroup[] = [
  {
    id: "mario-kart",
    heading: "Mario Kart",
    entries: [
      { slug: "mario-kart-8-deluxe", href: "/randomizers/mario-kart-8-deluxe", title: "Mario Kart 8 Deluxe", blurb: "Kart combos for up to 12 players, plus tracks and items.", image: "/images/fg/mk8dx-kart-selection-screen.jpg", imageAlt: "Mario Kart 8 Deluxe selection screen" },
      { slug: "mario-kart-world", href: "/randomizers/mario-kart-world", title: "Mario Kart World", blurb: "Characters, karts, tracks and knockout rallies for up to 24.", image: "/images/bg/mkw-main-image.jpg", imageAlt: "Mario Kart World" },
      { slug: "mario-kart-64", href: "/randomizers/mario-kart-64", title: "Mario Kart 64", blurb: "A different character for up to 4, all 16 tracks and battle courses.", beta: true },
    ],
  },
  {
    id: "mario-party",
    heading: "Mario Party",
    entries: [
      { slug: "super-mario-party-jamboree", href: "/randomizers/super-mario-party-jamboree", title: "Mario Party Jamboree", blurb: "Board, rules, turns, characters and minigames.", image: "https://cdn.empac.co/gameshuffle/images/mario-party-jamboree/mario-party-jamboree-hero.avif", imageAlt: "Super Mario Party Jamboree board" },
      { slug: "mario-party-superstars", href: "/randomizers/mario-party-superstars", title: "Mario Party Superstars", blurb: "Five classic boards and 100 minigames.", image: "https://cdn.empac.co/gameshuffle/images/mario-party-superstars/mario-party-superstars-hero.jpg", imageAlt: "Mario throwing a Dice Block on a Mario Party Superstars board" },
      { slug: "mario-party", href: "/randomizers/mario-party", title: "Mario Party", blurb: "The N64 original: 8 boards and 50 minigames.", image: GAME_ART["mario-party"].hero.src, imageAlt: GAME_ART["mario-party"].hero.alt, beta: true },
      { slug: "mario-party-2", href: "/randomizers/mario-party-2", title: "Mario Party 2", blurb: "Six lands and 65 minigames.", image: GAME_ART["mario-party-2"].hero.src, imageAlt: GAME_ART["mario-party-2"].hero.alt, beta: true },
      { slug: "mario-party-3", href: "/randomizers/mario-party-3", title: "Mario Party 3", blurb: "Battle Royale boards and 71 minigames.", image: GAME_ART["mario-party-3"].hero.src, imageAlt: GAME_ART["mario-party-3"].hero.alt, beta: true },
    ],
  },
  {
    id: "pokemon",
    heading: "Pokémon",
    entries: [
      { slug: "pokemon-stadium", href: "/randomizers/pokemon-stadium", title: "Pokémon Stadium", blurb: "Rental teams for every Stadium and Stadium 2 cup.", image: GAME_ART["pokemon-stadium"].hero.src, imageAlt: GAME_ART["pokemon-stadium"].hero.alt, beta: true },
      { slug: "pokemon-firered-leafgreen", href: "/randomizers/pokemon-firered-leafgreen", title: "Fire Red & Leaf Green Run Challenge", short: "Fire Red & Leaf Green", blurb: "A starter, catches before every gym, level caps.", image: GAME_ART["pokemon-firered-leafgreen"].hero.src, imageAlt: GAME_ART["pokemon-firered-leafgreen"].hero.alt, beta: true, cta: "Start a run" },
    ],
  },
  {
    id: "hero-shooters",
    heading: "Hero shooters",
    entries: [
      { slug: "overwatch", href: "/randomizers/overwatch", title: "Overwatch", blurb: "Hero roulette with role queue, no repeats and a random map.", beta: true, cta: "Roll heroes" },
      { slug: "marvel-rivals", href: "/randomizers/marvel-rivals", title: "Marvel Rivals", blurb: "Hero roulette, Team-Up teams and a random map.", beta: true, cta: "Roll heroes" },
    ],
  },
  {
    id: "more",
    heading: "More games",
    entries: [
      { slug: "super-smash-bros-ultimate", href: "/randomizers/super-smash-bros-ultimate", title: "Smash Ultimate", blurb: "Fighters, stages, rules and Squad Strike for up to 8.", image: "https://cdn.empac.co/gameshuffle/images/standard/smash-bros-ultimate-cast-artwork.jpg", imageAlt: "Super Smash Bros. Ultimate cast artwork" },
      { slug: "goldeneye-007", href: "/randomizers/goldeneye-007", title: "GoldenEye 007", blurb: "Scenario, map, weapons and characters for 2 to 4.", image: GAME_ART["goldeneye-007"].hero.src, imageAlt: GAME_ART["goldeneye-007"].hero.alt, beta: true },
      { slug: "perfect-dark", href: "/randomizers/perfect-dark", title: "Perfect Dark", blurb: "Scenario, arena, weapons and simulants for a Combat Simulator match.", beta: true },
      { slug: "kirby-air-riders", href: "/randomizers/kirby-air-riders", title: "Kirby Air Riders", blurb: "Riders, machines, courses and City Trial Stadiums." },
      { slug: "splatoon-3", href: "/randomizers/splatoon-3", title: "Splatoon 3", blurb: "Weapon kits, battles, Salmon Run and teams." },
    ],
  },
];

/** The groups with only the randomizers that are public right now. */
export function randomizerCatalog(): CatalogGroup[] {
  return GROUPS.map((g) => ({ ...g, entries: g.entries.filter((e) => randomizerPublic(e.slug)) })).filter((g) => g.entries.length);
}
