/**
 * Game spaces (game spaces picks 2026-11-05, all A, https://claude.ai/artifact/YBhN8GBidm9XpEkx78EbWw): one space per
 * game where its community lives (what's happening, boards, events, posts, crews, who's playing), with each viewer's
 * own slice. The home is your slice of your games' spaces; a profile is someone's slice. A space lives at
 * /games/<id>, out of search (noindex; the tools that earn search keep their own pages, menus and titles).
 *
 * `opens` is the Pacific day a space opens to everyone; until then only staff see it. The plan was one at a time
 * (5A); Britton opened all five on 2026-11-07 ("let's open up all the spaces we can"). A new space starts at null
 * and gets its day when it's ready. The first wave of new spaces opened 2026-11-09 (plan approved all as recommended):
 * six for games we have tools for (Overwatch, Marvel Rivals, Street Fighter 6, Tekken 8, Splatoon 3, Kirby Air Riders)
 * and ten ideas spaces (`ideas`) for big games we have no tools for yet. Client-safe and pure.
 */

import { gameKey, familyKeys, type GameKey } from "./key";
import type { MmrGame } from "@/lib/mmr/rules";
import type { TtGame } from "@/lib/timeTrials/tracks";
import { KIRBY_PUBLIC, MARVEL_RIVALS_PUBLIC, OVERWATCH_PUBLIC, SONIC_PUBLIC, SPLATOON_PUBLIC } from "@/lib/games-visibility";
import { MKWII_PUBLIC, POKEMON_CHAMPIONS_PUBLIC } from "@/lib/games-visibility";
import { WONDER_PUBLIC } from "@/lib/games-visibility";
import { MELEE_PUBLIC } from "@/lib/games-visibility";
import { DOUBLE_DASH_PUBLIC } from "@/lib/games-visibility";

export type SpaceId =
  | "mario-kart-8-deluxe" | "mario-kart-world" | "pokemon" | "mario-party" | "smash"
  // First wave of new spaces (2026-11-09): games we have tools for...
  | "overwatch" | "marvel-rivals" | "street-fighter-6" | "tekken-8" | "splatoon-3" | "kirby-air-riders"
  // ...and ideas spaces, for big games we have no tools for yet.
  | "fortnite" | "valorant" | "league-of-legends" | "minecraft" | "apex-legends" | "dead-by-daylight" | "rocket-league"
  | "call-of-duty-warzone" | "sonic" | "gran-turismo-7"
  // Levels from players (picks 2026-11-11): games whose levels travel by code.
  | "super-mario-maker-2" | "fall-guys" | "geometry-dash"
  // Pokémon Champions (picks 2026-11-11): its own space, for battle players (teams and tournaments).
  | "pokemon-champions"
  // Mario Kart Wii (picks 2026-11-11): its own space, with the randomizer and the war bot.
  | "mario-kart-wii"
  // Super Mario Bros. Wonder (picks 2026-11-11): its own space, a co-op game where rolls make a challenge night.
  | "super-mario-bros-wonder"
  // Super Smash Bros. Melee (picks 2026-11-11): its own space for the Melee scene, apart from Ultimate.
  | "super-smash-bros-melee"
  // Retro Mario Kart (picks 2026-11-12): Double Dash!!, DS, 64, 7 and Super Mario Kart in one space.
  | "retro-mario-kart";

/**
 * A space's tabs, picked per game like a sports app's (phone picks 2026-11-05, 2A): each tab one kind of thing.
 * Built so far: now, boards, events, lounge, people, posts (posts belong to games, step 3).
 */
export type SpaceTab = "now" | "you" | "rolls" | "boards" | "events" | "lounge" | "people" | "posts" | "dailies" | "road" | "cards" | "nights" | "ideas" | "levels" | "seeds";
export const SPACE_TAB_LABEL: Record<SpaceTab, string> = {
  now: "Now", you: "You", rolls: "Rolls", boards: "Boards", events: "Events", lounge: "Lounge", people: "People", posts: "Posts",
  dailies: "Dailies", road: "Road", cards: "Cards", nights: "Nights", ideas: "Ideas", levels: "Levels", seeds: "Seeds",
};

export interface SpaceTool { label: string; href: string }

/** One game a space's Rolls can switch to (Retro Mario Kart: Double Dash, Mario Kart DS, Mario Kart 64...). */
export interface SpaceRollGame {
  game: GameKey;
  /** Its name on the switch ("Double Dash"). */
  short: string;
  /** The roll button for it ("Roll a pair"). */
  label: string;
  /** Its randomizer page. */
  href: string;
}

/**
 * What an ideas space asks (spaces first wave, 2026-11-09): a game we have no tools for yet opens on its Ideas tab with
 * "What should we build for <game>?", one line, and three starter ideas written from the catalog's pitch. Ideas are
 * Idea Board ideas tagged with the game (gs_ideas.game), so voting and staff review stay one system. When a tool ships,
 * the space gets its tabs (Now first, You, Rolls...) and keeps Ideas further along, or drops it.
 */
export interface SpaceIdeas {
  /** The line under the question: what we could build for it. */
  line: string;
  /** Three starter ideas; each opens the idea form with its title filled in. */
  starters: [string, string, string];
}

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
  /**
   * A time trial board outside Mario Kart (Kirby Air Riders, 2026-11-09): Boards adds a Time trials tile beside the
   * season board, Now shows the week's new records, and the Tools list links it, all once its boards are open
   * (ttGameReady). Without the Mario Kart extras `tt` brings (combo challenges, builds, the lounge).
   */
  ttBoard?: TtGame;
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
  /** False while the game itself is hidden (src/lib/games-visibility.ts): the space stays staff only, whatever `opens` says. */
  shown?: boolean;
  /** Marked New on /games (the site's New badge) while it's just opened. */
  isNew?: boolean;
  /** An ideas space: what it asks. Its tabs start with "ideas". */
  ideas?: SpaceIdeas;
  /** False where nothing in the game is yours yet (no saves, streak or season): no You tab. */
  you?: boolean;
  /** What joining keeps, on the sign-up sheet a visitor's Join opens (the sheet's own line when unset). */
  join?: string;
  /**
   * The roll, where it isn't the main button (Melee's main button is Run a bracket): the Rolls tab's button label and
   * its link to the full randomizer. Unset = the main button is the roll.
   */
  roll?: SpaceTool;
  /** A Smash game whose tournament stage list Now explains (game 1 strikes, the counterpicks, the organizer's list). */
  strikes?: GameKey;
  /** A co-op game with no winner (Super Mario Bros. Wonder): the space offers game nights and its roll, never a tournament. */
  coop?: boolean;
  /**
   * A space with more than one game to roll (Retro Mario Kart, picks 2026-11-12): the games Rolls can switch between, in
   * order, the first one shown first. Each keeps its own randomizer page (search is per game). Unset = the main game.
   */
  rollGames?: SpaceRollGame[];
}

// Pokémon Champions has its own space (battle players come for teams and tournaments, picks 2026-11-11).
const POKEMON_GAMES = familyKeys("pokemon").filter((g) => g !== "pokemon-champions");
const MARIO_PARTY_GAMES = familyKeys("mario-party");
const SONIC_GAMES = familyKeys("sonic");

/** Where "Suggest an idea" goes: the Idea Board's form with the game set (and a starter's title, when one was tapped). */
export function ideaFormHref(game: GameKey, title?: string): string {
  const q = new URLSearchParams({ game, category: "randomizer" });
  if (title) q.set("title", title);
  return `/ideas/submit?${q.toString()}`;
}

/**
 * An ideas space (mockup approved 2026-11-09): the game's box art, blurred, is its header (no key art), then Ideas,
 * Now, Posts and People. The id is the game's catalog key.
 */
function ideasSpace(
  id: SpaceId, name: string, short: string, accent: string, line: string, starters: [string, string, string],
  /** A series space: its games and the one Join adds (Sonic: every Sonic game, Sonic Racing: CrossWorlds first). */
  family?: { games: GameKey[]; primary: GameKey },
): GameSpace {
  const primary = family?.primary ?? id;
  return {
    id, name, short, games: family?.games.length ? family.games : [primary], primary,
    tabs: ["ideas", "now", "posts", "people"], you: false,
    hero: null, box: `/images/box-art/${primary}.webp`, accent,
    tools: [],
    main: { label: "Suggest an idea", href: ideaFormHref(primary) },
    opens: "2026-11-09", isNew: true,
    join: `Free. Vote on what we build for ${name}, post with its players, and hear when something ships.`,
    ideas: { line, starters },
  };
}

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
    opens: "2026-11-07",
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
    opens: "2026-11-07",
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
    opens: "2026-11-07",
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
    opens: "2026-11-07",
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
    opens: "2026-11-07",
  },

  // ── First wave (2026-11-09): games we have tools for ──────────────────────
  {
    id: "overwatch", name: "Overwatch", short: "Overwatch", games: ["overwatch"], primary: "overwatch",
    tabs: ["now", "rolls", "events", "people", "posts"], you: false,
    hero: "/images/overwatch/overwatch-keyart.webp", box: "/images/box-art/overwatch.webp", accent: "#f08a1c",
    tools: [
      { label: "Hero roulette", href: "/randomizers/overwatch" },
      { label: "Hero tier list", href: "/tier-list-maker/overwatch-heroes" },
      { label: "Random-hero tournament", href: "/tournament/create?game=overwatch" },
      { label: "Bracket", href: "/bracket-generator" },
    ],
    main: { label: "Roll a hero", href: "/randomizers/overwatch" },
    opens: "2026-11-09", shown: OVERWATCH_PUBLIC, isNew: true,
    join: "Free. Your posts and events in Overwatch stay here, and you hear when a tournament starts.",
  },
  {
    id: "marvel-rivals", name: "Marvel Rivals", short: "Rivals", games: ["marvel-rivals"], primary: "marvel-rivals",
    tabs: ["now", "rolls", "events", "people", "posts"], you: false,
    hero: "/images/marvel-rivals/marvel-rivals-keyart.webp", box: "/images/box-art/marvel-rivals.webp", accent: "#d4303d",
    tools: [
      { label: "Hero roulette", href: "/randomizers/marvel-rivals" },
      { label: "Hero tier list", href: "/tier-list-maker/marvel-rivals-heroes" },
      { label: "Random-hero tournament", href: "/tournament/create?game=marvel-rivals" },
      { label: "Bracket", href: "/bracket-generator" },
    ],
    main: { label: "Roll a hero", href: "/randomizers/marvel-rivals" },
    opens: "2026-11-09", shown: MARVEL_RIVALS_PUBLIC, isNew: true,
    join: "Free. Your posts and events in Marvel Rivals stay here, and you hear when a tournament starts.",
  },
  {
    id: "street-fighter-6", name: "Street Fighter 6", short: "SF6", games: ["street-fighter-6"], primary: "street-fighter-6",
    tabs: ["now", "events", "people", "posts"], you: false,
    hero: null, box: "/images/box-art/street-fighter-6.webp", accent: "#e8590c",
    tools: [
      { label: "Random-character tournament", href: "/tournament/create?game=street-fighter-6" },
      { label: "Bracket", href: "/bracket-generator" },
      { label: "Swiss pairings", href: "/swiss-pairing-generator" },
      { label: "Round robin", href: "/round-robin-generator" },
    ],
    main: { label: "Run a tournament", href: "/tournament/create?game=street-fighter-6" },
    opens: "2026-11-09", isNew: true,
    join: "Free. Your posts and events in Street Fighter 6 stay here, and you hear when a tournament starts.",
  },
  {
    id: "tekken-8", name: "Tekken 8", short: "Tekken 8", games: ["tekken-8"], primary: "tekken-8",
    tabs: ["now", "events", "people", "posts"], you: false,
    hero: null, box: "/images/box-art/tekken-8.webp", accent: "#b91c1c",
    tools: [
      { label: "Random-character tournament", href: "/tournament/create?game=tekken-8" },
      { label: "Bracket", href: "/bracket-generator" },
      { label: "Swiss pairings", href: "/swiss-pairing-generator" },
      { label: "Round robin", href: "/round-robin-generator" },
    ],
    main: { label: "Run a tournament", href: "/tournament/create?game=tekken-8" },
    opens: "2026-11-09", isNew: true,
    join: "Free. Your posts and events in Tekken 8 stay here, and you hear when a tournament starts.",
  },
  {
    id: "splatoon-3", name: "Splatoon 3", short: "Splatoon 3", games: ["splatoon-3"], primary: "splatoon-3",
    tabs: ["now", "rolls", "events", "people", "posts"],
    hero: "/images/splatoon-3/splatoon-3-keyart.webp", box: "/images/box-art/splatoon-3.webp", accent: "#7a9a01",
    tools: [
      { label: "Randomizer", href: "/randomizers/splatoon-3" },
      { label: "Stage tier list", href: "/tier-list-maker/splatoon-3-stages" },
      { label: "Random-kit tournament", href: "/tournament/create?game=splatoon-3" },
    ],
    main: { label: "Roll a kit", href: "/randomizers/splatoon-3" },
    opens: "2026-11-09", shown: SPLATOON_PUBLIC, isNew: true,
    join: "Free. Your saved setups and posts stay here, and you hear when a tournament starts.",
  },
  {
    id: "kirby-air-riders", name: "Kirby Air Riders", short: "Air Riders", games: ["kirby-air-riders"], primary: "kirby-air-riders",
    tabs: ["now", "rolls", "events", "boards", "people", "posts"], ttBoard: "kar",
    hero: "/images/kirby-air-riders/kirby-air-riders-big-battle.webp", box: "/images/box-art/kirby-air-riders.webp", accent: "#e0679a",
    tools: [
      { label: "Randomizer", href: "/randomizers/kirby-air-riders" },
      // Shown once Kirby's boards are open (the space page drops it until then).
      { label: "Time trials", href: "/time-trials/kirby-air-riders" },
      { label: "Rider tier list", href: "/tier-list-maker/kirby-air-riders-riders" },
      { label: "Machine tier list", href: "/tier-list-maker/kirby-air-riders-machines" },
      { label: "Plan a night", href: "/game-nights/tools/night-planner" },
    ],
    main: { label: "Roll a rider", href: "/randomizers/kirby-air-riders" },
    opens: "2026-11-09", shown: KIRBY_PUBLIC, isNew: true,
    join: "Free. Your saved setups and points from live nights stay here, and you hear when a cup or a night starts.",
  },

  // Mario Kart Wii (picks 2026-11-11, all as recommended): its own space with the randomizer, the war bot (its own
  // points table) and tournaments; no time trial boards. Opens with the 2026-11-11 release (Britton, 2026-11-12), and
  // stays hidden while the randomizer is (MKWII_PUBLIC). Ideas sits at the end for what comes next.
  {
    id: "mario-kart-wii", name: "Mario Kart Wii", short: "MKWii", games: ["mario-kart-wii"], primary: "mario-kart-wii",
    tabs: ["now", "rolls", "events", "people", "posts", "ideas"], you: false,
    hero: "/images/mario-kart-wii/mario-kart-wii-keyart.webp", box: "/images/box-art/mario-kart-wii.webp", accent: "#0a8fd8",
    tools: [
      { label: "Randomizer", href: "/randomizers/mario-kart-wii" },
      { label: "Wars", href: "/help/competitive/wars" },
      { label: "Run a tournament", href: "/tournament/create?game=mario-kart-wii" },
      { label: "Track tier list", href: "/tier-list-maker/mario-kart-wii-tracks" },
      { label: "Bracket", href: "/bracket-generator" },
    ],
    main: { label: "Roll a combo", href: "/randomizers/mario-kart-wii" },
    merch: /kart|race|drift|lap|blue shell|podium/i,
    opens: "2026-11-11", shown: MKWII_PUBLIC, isNew: true,
    join: "Free. Your posts and events in Mario Kart Wii stay here, and you hear when a tournament starts.",
    ideas: {
      line: "Custom track rolls, rules for a couch night, more for your wars.",
      starters: ["Custom track randomizer", "Couch night item rules", "Chat picks the next track"],
    },
  },

  // ── First wave (2026-11-09): ideas spaces, for big games we have no tools for yet ──
  // Levels from players (picks 2026-11-11): Fortnite's island codes get a Levels board, second after Ideas.
  { ...ideasSpace("fortnite", "Fortnite", "Fortnite", "#7b3fe4", "A randomizer, a mode for your squad, a chat game for stream.", ["Drop spot roll", "Loadout roulette", "Challenge rules"]),
    tabs: ["ideas", "levels", "now", "posts", "people"] },
  ideasSpace("valorant", "VALORANT", "VALORANT", "#ff4655", "An agent roll, a mode for your five, a chat game for stream.", ["Agent roll by role", "Map roll", "Chat picks your agent"]),
  ideasSpace("league-of-legends", "League of Legends", "League", "#c89b3c", "A champion roll, rules for a chaos night, a chat game for stream.", ["Champion roll by role", "ARAM chaos rules", "Chat picks your champion"]),
  // Minecraft's first tools, from the speedrun roster (2026-11-11): its splits page and the speedrun overlay, whose races
  // show one set seed to everyone at the countdown. Now leads; Ideas stays for what comes next.
  // Seeds (curation picks 15A, 2026-11-11): a board of seeds, second after Now (shown once supabase/levels-m2.sql has run).
  { ...ideasSpace("minecraft", "Minecraft", "Minecraft", "#3c8527", "A challenge run, rules for your server, a chat game for stream.", ["Challenge seed", "Run rules roll", "Chat picks the twist"]),
    tabs: ["now", "seeds", "ideas", "posts", "people"],
    tools: [
      { label: "Speedrun splits", href: "/speedrun/splits/minecraft" },
      { label: "Speedrun overlay and races", href: "/speedrun" },
    ],
    main: { label: "Get speedrun splits", href: "/speedrun/splits/minecraft" } },
  ideasSpace("apex-legends", "Apex Legends", "Apex", "#cd3333", "A legend roll, a mode for your squad, a chat game for stream.", ["Legend roll by class", "Drop spot roll", "Squad challenge rules"]),
  ideasSpace("dead-by-daylight", "Dead by Daylight", "DBD", "#9b1c1c", "A build roll, rules for a lobby, a chat game for stream.", ["Killer roll", "Survivor perk build", "Chat picks the killer"]),
  ideasSpace("rocket-league", "Rocket League", "Rocket League", "#1f6feb", "A car and arena roll, a mode for your team, a chat game for stream.", ["Car roll", "Arena roll", "Mutator chaos"]),
  ideasSpace("call-of-duty-warzone", "Call of Duty: Warzone", "Warzone", "#5b6b2f", "A loadout roll, a mode for your squad, a chat game for stream.", ["Loadout roulette", "Drop spot roll", "Squad challenge rules"]),
  // Sonic's first tool, the CrossWorlds randomizer (2026-11-09): Now leads, Rolls rolls a racer and machine, and Ideas
  // stays further along for what comes next.
  {
    ...ideasSpace("sonic", "Sonic", "Sonic", "#1e5bd8", "A race night mode, a chat draft for stream, randomizers for more Sonic games.", ["Race night rules", "Chat drafts your racer", "Team Sonic Racing randomizer"],
      { games: SONIC_GAMES, primary: "sonic-racing-crossworlds" }),
    tabs: ["now", "rolls", "ideas", "posts", "people"], you: undefined,
    tools: [
      { label: "Randomizer", href: "/randomizers/sonic-racing-crossworlds" },
      { label: "Racer tier list", href: "/tier-list-maker/sonic-racing-crossworlds-racers" },
      { label: "Random-racer tournament", href: "/tournament/create?game=sonic-racing-crossworlds" },
      { label: "Plan a night", href: "/game-nights/tools/night-planner" },
    ],
    main: { label: "Roll a racer", href: "/randomizers/sonic-racing-crossworlds" },
    shown: SONIC_PUBLIC,
    join: "Free. Your saved setups and posts stay here, and you hear when a tournament starts.",
  },
  ideasSpace("gran-turismo-7", "Gran Turismo 7", "GT7", "#1d4ed8", "A car and track roll, rules for a lobby race, a chat game for stream.", ["Car roll by class", "Track roll", "Lobby race rules"]),

  // ── Levels from players (picks 2026-11-11): spaces for games whose levels travel by code. Britton opened both on
  //    2026-11-11 ("we need some good ones for curating UGC"). Their Levels board, and the queue streamers run from chat. ──
  {
    ...ideasSpace("super-mario-maker-2", "Super Mario Maker 2", "Mario Maker 2", "#e8a317",
      "A course roll for chat, a level race night, challenge rules for your viewers.", ["Chat picks the course style", "Level race night", "Endless challenge rules"]),
    tabs: ["now", "levels", "ideas", "posts", "people"],
    tools: [
      { label: "Levels", href: "/games/super-mario-maker-2?tab=levels" },
      { label: "Level queue for streamers", href: "/help/streaming/level-queue" },
    ],
    main: { label: "Share a level", href: "/games/super-mario-maker-2?tab=levels" },
    opens: "2026-11-11", isNew: true,
    join: "Free. Share your courses, see which ones streamers played, and post with other makers.",
  },
  {
    ...ideasSpace("fall-guys", "Fall Guys", "Fall Guys", "#e0679a",
      "A round roll for custom lobbies, rules for a party night, a chat game for stream.", ["Round roll", "Party night rules", "Chat picks the round"]),
    tabs: ["now", "levels", "ideas", "posts", "people"],
    tools: [
      { label: "Levels", href: "/games/fall-guys?tab=levels" },
      { label: "Level queue for streamers", href: "/help/streaming/level-queue" },
    ],
    main: { label: "Share a level", href: "/games/fall-guys?tab=levels" },
    opens: "2026-11-11", isNew: true,
    join: "Free. Share your Creative levels, see which ones streamers played, and post with other players.",
  },
  // Geometry Dash (curation picks 14A, 2026-11-11): level IDs in the queue and a board. Opens with the 2026-11-11
  // release (Britton, 2026-11-12; its board needs supabase/levels-m2.sql, in the release's before-push file).
  {
    ...ideasSpace("geometry-dash", "Geometry Dash", "Geometry Dash", "#2f9e44",
      "A level roll for chat, a demon night for your group, challenge rules for your viewers.", ["Chat picks the next level", "Demon night rules", "Random level challenge"]),
    tabs: ["now", "levels", "ideas", "posts", "people"],
    tools: [
      { label: "Levels", href: "/games/geometry-dash?tab=levels" },
      { label: "Level queue for streamers", href: "/help/streaming/level-queue" },
    ],
    main: { label: "Share a level", href: "/games/geometry-dash?tab=levels" },
    opens: "2026-11-11", isNew: true,
    join: "Free. Share your levels, see which ones streamers beat, and post with other players.",
  },

  // ── Pokémon Champions (picks 2026-11-11, all as recommended): its own space, apart from Pokémon, for battle players.
  //    The team builder is the main button and the first tool; tournaments take team lists. Opens with the 2026-11-11
  //    release (Britton, 2026-11-12). ──
  {
    ...ideasSpace("pokemon-champions", "Pokémon Champions", "Champions", "#2b4fc7",
      "Rules for a draft night, a ladder for your group, a chat game for stream.", ["Draft night rules", "A ladder for my group", "Chat guesses my lead"]),
    tabs: ["now", "events", "people", "posts", "ideas"],
    tools: [
      { label: "Team builder", href: "/pokemon-champions-team-builder" },
      { label: "Tournament with team lists", href: "/tournament/create?game=pokemon-champions" },
      { label: "Chat Draft for streamers", href: "/help/streaming/chat-draft" },
      { label: "Swiss pairings", href: "/swiss-pairing-generator" },
    ],
    main: { label: "Build a team", href: "/pokemon-champions-team-builder" },
    opens: "2026-11-11", shown: POKEMON_CHAMPIONS_PUBLIC, isNew: true,
    join: "Free. Your posts and events in Pokémon Champions stay here, and you hear when a tournament starts.",
  },
  // ── Super Mario Bros. Wonder (picks 2026-11-11, all as recommended): four-player couch co-op, where a roll turns a
  //    play-through into a challenge night (a character and badge each, a level by world, rules). Staff only until
  //    Britton sets an opening day: `opens` and WONDER_PUBLIC. Ideas sits further along for what comes next. ──
  {
    id: "super-mario-bros-wonder", name: "Super Mario Bros. Wonder", short: "Wonder", games: ["super-mario-bros-wonder"], primary: "super-mario-bros-wonder",
    tabs: ["now", "rolls", "events", "people", "posts", "ideas"], you: false,
    hero: "/images/super-mario-bros-wonder/super-mario-bros-wonder-keyart.webp", box: "/images/box-art/super-mario-bros-wonder.webp", accent: "#6d3fd1",
    tools: [
      { label: "Challenge randomizer", href: "/randomizers/super-mario-bros-wonder" },
      { label: "Badge tier list", href: "/tier-list-maker/super-mario-bros-wonder-badges" },
    ],
    main: { label: "Roll a challenge", href: "/randomizers/super-mario-bros-wonder" },
    opens: null, shown: WONDER_PUBLIC, isNew: true, coop: true,
    join: "Free. Your posts and events in Super Mario Bros. Wonder stay here, and you hear when one starts.",
    ideas: {
      line: "Chat games for stream, a race night mode, more rules for your co-op nights.",
      starters: ["Chat picks our badges", "Race to the Goal Pole night", "Wonder Seed hunt for four"],
    },
  },

  // ── Retro Mario Kart (picks 2026-11-12, all as recommended): Mario Kart: Double Dash!!, Mario Kart DS, Mario Kart
  //    64, Mario Kart 7 and Super Mario Kart (DS, 7 and Super Mario Kart added the same day, each with its own picks)
  //    in one space, with a game switch on Rolls and wherever a roll shows. Each game keeps its own randomizer page and
  //    address (search is per game). Tournaments by name (brackets, Swiss, points), no wars or time trial boards. Staff
  //    only until Britton sets an opening day: `opens`, DOUBLE_DASH_PUBLIC, MARIO_KART_DS_PUBLIC, MARIO_KART_7_PUBLIC
  //    and SUPER_MARIO_KART_PUBLIC (Mario Kart 64's page stays public as it was). Ideas sits further along for what
  //    comes next. ──
  {
    id: "retro-mario-kart", name: "Retro Mario Kart", short: "Retro MK", games: ["mario-kart-double-dash", "mario-kart-ds", "mario-kart-64", "mario-kart-7", "super-mario-kart"], primary: "mario-kart-double-dash",
    tabs: ["now", "rolls", "events", "people", "posts", "ideas"], you: false,
    hero: "/images/mario-kart-double-dash/mario-kart-double-dash-keyart.webp", box: "/images/box-art/mario-kart-double-dash.webp", accent: "#6b3fb5",
    tools: [
      { label: "Double Dash randomizer", href: "/randomizers/mario-kart-double-dash" },
      { label: "Mario Kart DS randomizer", href: "/randomizers/mario-kart-ds" },
      { label: "Mario Kart 64 randomizer", href: "/randomizers/mario-kart-64" },
      { label: "Mario Kart 7 randomizer", href: "/randomizers/mario-kart-7" },
      { label: "Super Mario Kart randomizer", href: "/randomizers/super-mario-kart" },
      { label: "Run a tournament", href: "/tournament/create?game=mario-kart-double-dash" },
      { label: "Double Dash track tier list", href: "/tier-list-maker/mario-kart-double-dash-tracks" },
      { label: "Double Dash kart tier list", href: "/tier-list-maker/mario-kart-double-dash-karts" },
      { label: "Mario Kart DS track tier list", href: "/tier-list-maker/mario-kart-ds-tracks" },
      { label: "Mario Kart 64 track tier list", href: "/tier-list-maker/mario-kart-64-tracks" },
      { label: "Mario Kart 7 track tier list", href: "/tier-list-maker/mario-kart-7-tracks" },
      { label: "Super Mario Kart track tier list", href: "/tier-list-maker/super-mario-kart-tracks" },
      { label: "Bracket", href: "/bracket-generator" },
    ],
    main: { label: "Roll a pair", href: "/randomizers/mario-kart-double-dash" },
    rollGames: [
      { game: "mario-kart-double-dash", short: "Double Dash", label: "Roll a pair", href: "/randomizers/mario-kart-double-dash" },
      { game: "mario-kart-ds", short: "Mario Kart DS", label: "Roll a racer and kart", href: "/randomizers/mario-kart-ds" },
      { game: "mario-kart-64", short: "Mario Kart 64", label: "Roll a racer", href: "/randomizers/mario-kart-64" },
      { game: "mario-kart-7", short: "Mario Kart 7", label: "Roll a kart", href: "/randomizers/mario-kart-7" },
      { game: "super-mario-kart", short: "Super Mario Kart", label: "Roll a racer", href: "/randomizers/super-mario-kart" },
    ],
    merch: /kart|race|drift|lap|blue shell|podium/i,
    opens: null, shown: DOUBLE_DASH_PUBLIC, isNew: true,
    join: "Free. Your posts and events in Double Dash, Mario Kart DS, 64, 7 and Super Mario Kart stay here, and you hear when a tournament starts.",
    ideas: {
      line: "Super Circuit next, rules for a couch night, chat games for stream.",
      starters: ["Mario Kart: Super Circuit randomizer", "Couch night item rules", "Chat picks the next cup"],
    },
  },

  // ── Super Smash Bros. Melee (picks 2026-11-11, all as recommended): its own space, since Melee players run their own
  //    scene. Opens with the randomizer and tournaments that strike stages from each event's own list; Run a bracket is
  //    the main button and the roll lives on Rolls. Staff only until Britton sets an opening day: `opens` and
  //    MELEE_PUBLIC. ──
  {
    id: "super-smash-bros-melee", name: "Super Smash Bros. Melee", short: "Melee", games: ["super-smash-bros-melee"], primary: "super-smash-bros-melee",
    tabs: ["now", "events", "rolls", "people", "posts", "ideas"], you: false,
    hero: "/images/super-smash-bros-melee/super-smash-bros-melee-keyart.webp", box: "/images/box-art/super-smash-bros-melee.webp", accent: "#c8102e",
    tools: [
      { label: "Randomizer", href: "/randomizers/super-smash-bros-melee" },
      { label: "Fighter tier list", href: "/tier-list-maker/smash-melee-fighters" },
      { label: "Stage tier list", href: "/tier-list-maker/smash-melee-stages" },
      { label: "Free bracket maker", href: "/bracket-generator" },
    ],
    main: { label: "Run a bracket", href: "/tournament/create?game=super-smash-bros-melee" },
    roll: { label: "Roll a fighter", href: "/randomizers/super-smash-bros-melee" },
    strikes: "super-smash-bros-melee",
    merch: /smash|main|stock|fighter/i,
    opens: null, shown: MELEE_PUBLIC, isNew: true,
    join: "Free. Your posts and events in Melee stay here, and you hear when a bracket starts.",
    ideas: {
      line: "Crew battle nights, a ladder for your netplay group, more for your brackets.",
      starters: ["Crew battle night", "A netplay ladder for my group", "Chat picks my fighter"],
    },
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

/** Open to everyone on `day` (a Pacific YYYY-MM-DD), and its game isn't hidden. Staff see every space. */
export function spaceOpen(s: GameSpace, day: string): boolean {
  return s.shown !== false && !!s.opens && s.opens <= day;
}

/** The space's tabs in order. Spaces that open on Now get You second (in view on a phone), unless nothing is yours there. */
export function spaceTabs(s: GameSpace): SpaceTab[] {
  if (s.tabs[0] !== "now" || s.you === false) return s.tabs;
  return ["now", "you", ...s.tabs.filter((t) => t !== "now" && t !== "you")];
}

export const spacePath = (s: Pick<GameSpace, "id">) => `/games/${s.id}`;

/** Only asking what to build: an ideas space with no tools yet. A space that gets tools (Sonic's randomizer) keeps its
 *  Ideas tab but lists, titles and sells like the other spaces with tools. */
export const ideasOnly = (s: Pick<GameSpace, "ideas" | "tools">) => !!s.ideas && s.tools.length === 0;
