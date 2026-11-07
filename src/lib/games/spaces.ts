/**
 * Game spaces (game spaces picks 2026-11-05, all A, https://claude.ai/artifact/YBhN8GBidm9XpEkx78EbWw): one space per
 * game where its community lives (what's happening, boards, events, posts, crews, who's playing), with each viewer's
 * own slice. The home is your slice of your games' spaces; a profile is someone's slice. A space lives at
 * /games/<id>, out of search (noindex; the tools that earn search keep their own pages, menus and titles).
 *
 * Spaces open one at a time, each a launch moment (Britton: announce when a new space opens). `opens` is the
 * Pacific day it opens to everyone; until then only staff see it. Mario Kart 8 Deluxe goes first, then Mario Kart
 * World, Pokémon, Mario Party and Smash (5A). Client-safe and pure.
 */

import { gameKey, familyKeys, type GameKey } from "./key";
import type { MmrGame } from "@/lib/mmr/rules";
import type { TtGame } from "@/lib/timeTrials/tracks";

export type SpaceId = "mario-kart-8-deluxe" | "mario-kart-world" | "pokemon" | "mario-party" | "smash";

/**
 * A space's tabs, picked per game like a sports app's (phone picks 2026-11-05, 2A): each tab one kind of thing.
 * Built so far: now, boards, events, lounge, people, posts (posts belong to games, step 3).
 */
export type SpaceTab = "now" | "you" | "rolls" | "boards" | "events" | "lounge" | "people" | "posts" | "dailies" | "road" | "cards" | "nights";
export const SPACE_TAB_LABEL: Record<SpaceTab, string> = {
  now: "Now", you: "You", rolls: "Rolls", boards: "Boards", events: "Events", lounge: "Lounge", people: "People", posts: "Posts",
  dailies: "Dailies", road: "Road", cards: "Cards", nights: "Nights",
};

export interface SpaceTool { label: string; href: string }

export interface GameSpace {
  id: SpaceId;
  name: string;
  /** For tight places ("MK8DX"). */
  short: string;
  /** The games whose activity shows here (tournaments, nights, crews, posts, streams). */
  games: GameKey[];
  /** The game Join adds to your games. */
  primary: GameKey;
  /** Its tabs, in order (Now first). */
  tabs: SpaceTab[];
  /** Lounge games (MKCentral) and the time trials game, for the Mario Kart spaces. */
  lounge?: MmrGame[];
  tt?: TtGame;
  /** The space's header art (our own files or our CDN). */
  hero: string | null;
  /** Box art for small places. */
  box: string | null;
  /** The game's color (chips, the header's glow). */
  accent: string;
  /** Our tools for it, linked from the space; they keep their own pages (search earns there). */
  tools: SpaceTool[];
  /** The one button beside Join: the thing you'd do in this game right now ("Roll a build", "Roll a fighter"). */
  main: SpaceTool;
  /** Merch about this game comes first in the space's shop row (matched on the design's name; round two picks 8A). */
  merch?: RegExp;
  /** Pacific day it opens to everyone (YYYY-MM-DD), or null while it's staff only. */
  opens: string | null;
}

const POKEMON_GAMES = familyKeys("pokemon");
const MARIO_PARTY_GAMES = familyKeys("mario-party");

export const GAME_SPACES: GameSpace[] = [
  {
    id: "mario-kart-8-deluxe", name: "Mario Kart 8 Deluxe", short: "MK8DX", games: ["mario-kart-8-deluxe"], primary: "mario-kart-8-deluxe",
    tabs: ["now", "rolls", "boards", "events", "lounge", "people", "posts"], lounge: ["mk8dx"], tt: "mk8dx",
    hero: "/images/bg/MK8DX_Background_Music.jpg", box: "/images/box-art/mario-kart-8-deluxe.webp", accent: "#e60012",
    tools: [
      { label: "Randomizer", href: "/randomizers/mario-kart-8-deluxe" },
      { label: "Time trials", href: "/time-trials/mario-kart-8-deluxe" },
      { label: "Lounge", href: "/lounge?game=mk8dx" },
      { label: "MMR card", href: "/mmr-card" },
      { label: "Tier list", href: "/tier-list-maker/mario-kart-8-deluxe-karts" },
      { label: "Bracket", href: "/bracket-generator" },
    ],
    main: { label: "Roll a build", href: "/randomizers/mario-kart-8-deluxe" },
    merch: /kart|race|drift|lap|blue shell|podium/i,
    opens: null,
  },
  {
    id: "mario-kart-world", name: "Mario Kart World", short: "MK World", games: ["mario-kart-world"], primary: "mario-kart-world",
    tabs: ["now", "rolls", "boards", "events", "lounge", "people", "posts"], lounge: ["mkworld24p", "mkworld12p"], tt: "mkworld",
    hero: "/images/bg/mkw-main-image.jpg", box: "/images/box-art/mario-kart-world.webp", accent: "#0050a0",
    tools: [
      { label: "Randomizer", href: "/randomizers/mario-kart-world" },
      { label: "Time trials", href: "/time-trials/mario-kart-world" },
      { label: "Lounge", href: "/lounge?game=mkworld24p" },
      { label: "MMR card", href: "/mmr-card" },
      { label: "Tier list", href: "/tier-list-maker/mario-kart-world-vehicles" },
    ],
    main: { label: "Roll a build", href: "/randomizers/mario-kart-world" },
    merch: /kart|race|drift|lap|blue shell|podium/i,
    opens: null,
  },
  {
    id: "pokemon", name: "Pokémon", short: "Pokémon", games: POKEMON_GAMES, primary: "pokemon-tcg",
    tabs: ["now", "dailies", "road", "cards", "events", "people"],
    hero: "https://cdn.empac.co/gameshuffle/images/standard/pokemon-cards.png", box: "/images/box-art/pokemon-tcg.webp", accent: "#c2410c",
    tools: [
      { label: "Daily Dex", href: "/daily-dex" },
      { label: "Trainer Road", href: "/pokemon-trainers" },
      { label: "Name every Pokémon", href: "/name-every-pokemon" },
      { label: "Random Pokémon", href: "/randomizers/pokemon" },
      { label: "TCG Companion", href: "/pokemon-tcg-companion" },
      { label: "Deck guides", href: "/pokemon-tcg/decks" },
    ],
    main: { label: "Play today's Dex", href: "/daily-dex" },
    opens: null,
  },
  {
    id: "mario-party", name: "Mario Party", short: "Mario Party", games: MARIO_PARTY_GAMES, primary: "super-mario-party-jamboree",
    tabs: ["now", "rolls", "nights", "boards", "people", "posts"],
    hero: "https://cdn.empac.co/gameshuffle/images/mario-party-jamboree/mario-party-jamboree-hero.avif", box: "/images/box-art/super-mario-party-jamboree.webp", accent: "#e8a317",
    tools: [
      { label: "Jamboree randomizer", href: "/randomizers/super-mario-party-jamboree" },
      { label: "Superstars randomizer", href: "/randomizers/mario-party-superstars" },
      { label: "Plan a night", href: "/game-nights/tools/night-planner" },
      { label: "Board tier list", href: "/tier-list-maker/mario-party-jamboree-boards" },
    ],
    main: { label: "Roll a party", href: "/randomizers/super-mario-party-jamboree" },
    merch: /party|dice|star|board/i,
    opens: null,
  },
  {
    id: "smash", name: "Super Smash Bros. Ultimate", short: "Smash", games: ["super-smash-bros-ultimate"], primary: "super-smash-bros-ultimate",
    tabs: ["now", "rolls", "events", "boards", "people", "posts"],
    hero: "https://cdn.empac.co/gameshuffle/images/standard/smash-bros-ultimate-cast-artwork.jpg", box: "/images/box-art/super-smash-bros-ultimate.webp", accent: "#d33a2c",
    tools: [
      { label: "Randomizer", href: "/randomizers/super-smash-bros-ultimate" },
      { label: "Fighter tier list", href: "/tier-list-maker/smash-ultimate-fighters" },
      { label: "Bracket", href: "/bracket-generator" },
    ],
    main: { label: "Roll a fighter", href: "/randomizers/super-smash-bros-ultimate" },
    merch: /smash|main|stock|fighter/i,
    opens: null,
  },
];

const BY_ID = new Map<string, GameSpace>(GAME_SPACES.map((s) => [s.id, s]));
const BY_GAME = new Map<GameKey, GameSpace>();
for (const s of GAME_SPACES) for (const g of s.games) if (!BY_GAME.has(g)) BY_GAME.set(g, s);

export function spaceById(id: string | null | undefined): GameSpace | null {
  return id ? BY_ID.get(id) ?? null : null;
}

/** The space a game belongs to, from any way the game is named (`gameKey`), or null. */
export function spaceFor(game: string | null | undefined): GameSpace | null {
  const k = gameKey(game);
  return k ? BY_GAME.get(k) ?? null : null;
}

/** Open to everyone on `day` (a Pacific YYYY-MM-DD). Staff see every space. */
export function spaceOpen(s: GameSpace, day: string): boolean {
  return !!s.opens && s.opens <= day;
}

export const spacePath = (s: Pick<GameSpace, "id">) => `/games/${s.id}`;
