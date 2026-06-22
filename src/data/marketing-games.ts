/**
 * Games shown on marketing pages (GS Pro, Features). Two groups:
 *   - `available`   — games/modes GameShuffle supports today (live tools)
 *   - `development` — titles in active development (no tools yet)
 *
 * Imagery: `image` points at a local asset (or CDN). Titles without art
 * render a styled placeholder card — drop a path in here when art lands.
 * Keep this list as the single source of truth for the games showcase.
 */

export interface MarketingGame {
  name: string;
  blurb: string;
  /** Modes / tools available for this game (shown on the Features page). */
  modes?: string[];
  /** Local or CDN image; omit to render the placeholder treatment. */
  image?: string;
  imageAlt?: string;
  /** Deep link to the live tool, when one exists. */
  href?: string;
}

export const AVAILABLE_GAMES: MarketingGame[] = [
  {
    name: "Mario Kart 8 Deluxe",
    blurb:
      "Randomize 4-part kart combos for up to 12 players, run live competitive lounge scoring, and build full tournaments.",
    modes: ["Kart & track randomizer", "Competitive lounge", "Tournaments"],
    image: "/images/fg/mk8dx-kart-selection-screen.jpg",
    imageAlt: "Mario Kart 8 Deluxe kart selection screen",
    href: "/randomizers/mario-kart-8-deluxe",
  },
  {
    name: "Mario Kart World",
    blurb:
      "Randomize characters, karts, tracks, and items for up to 24 players — plus knockout rally support.",
    modes: ["Character & kart randomizer", "Knockout rallies", "Item randomizer"],
    image: "/images/bg/mkw-main-image.jpg",
    imageAlt: "Mario Kart World",
    href: "/randomizers/mario-kart-world",
  },
  {
    name: "Pokémon TCG",
    blurb:
      "A digital game-night kit for the Pokémon Trading Card Game — damage, conditions, prizes, coin flips, and dice.",
    modes: ["TCG Companion — Pokémon Mode"],
    image: "https://cdn.empac.co/gameshuffle/images/standard/pokemon-cards.png",
    imageAlt: "Pokémon TCG cards spread on a table",
    href: "/tcg-companion",
  },
];

export const IN_DEVELOPMENT_GAMES: MarketingGame[] = [
  {
    name: "Super Smash Bros. Ultimate",
    blurb: "Character, stage, and rules randomization for couch and stream brackets.",
    image: "https://cdn.empac.co/gameshuffle/images/standard/smash-bros-ultimate-cast-artwork.jpg",
    imageAlt: "Super Smash Bros. Ultimate cast artwork",
  },
  {
    name: "Mario Party",
    blurb: "Board, minigame, and house-rule shuffling for party-game nights.",
    image: "https://cdn.empac.co/gameshuffle/images/standard/mario-party-full-cast-artwork.jpg",
    imageAlt: "Mario Party full cast artwork",
  },
  {
    name: "Jackbox",
    blurb: "Pick-a-pack and game randomization for Jackbox party nights with your chat or couch.",
    image: "https://cdn.empac.co/gameshuffle/images/standard/jackbox-games-artwork.jpg",
    imageAlt: "Jackbox Games artwork",
  },
  {
    name: "More TCGs",
    blurb: "Companion support beyond Pokémon — Magic: The Gathering, Lorcana, One Piece, and more.",
    image: "https://cdn.empac.co/gameshuffle/images/standard/various-trading-card-game-cards.jpg",
    imageAlt: "A spread of trading card game cards from various games",
  },
];
