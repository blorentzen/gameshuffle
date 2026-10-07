/**
 * The game catalog: every game GameShuffle knows by name, with official box
 * art. One place for favorite-game pickers, profile shelves, editor modules
 * and the list of games worth a randomizer or mode next. Client-safe.
 *
 *   status  "live"       we have a randomizer, tool or tournament roster for it
 *           "candidate"  a good fit for a randomizer or a mode (why: `pitch`)
 *           "listed"     popular enough that people will want it as a favorite
 *
 * Box art is the publisher's cover as Twitch serves it for the game's
 * category (Helix Get Games), downloaded once by scripts/pull-box-art.ts into
 * public/images/box-art/<slug>.webp (300 x 400). `twitch` is the category name
 * when it differs from ours. A game without a file yet falls back to a lettered
 * tile (`boxArt` returns null).
 *
 * `name` is what's stored on users.favorite_games, so never rename an entry
 * people may have saved; add the old name to `aliases` instead.
 */

import { BOX_ART } from "@/data/box-art.generated";

export type CatalogStatus = "live" | "candidate" | "listed";

export interface CatalogEntry {
  slug: string;
  name: string;
  /** Other names people type or that we stored before ("Jackbox Party Pack"). */
  aliases?: string[];
  /** The Twitch category name, when it differs from `name`. */
  twitch?: string;
  /** Our app's game slug when it differs from `slug` (live nights call the N64 game "mario-party"). */
  appSlug?: string;
  status: CatalogStatus;
  /** Our page for it (randomizer, tool or hub). */
  href?: string;
  /** Why it's a candidate: the randomizer or mode it would make. */
  pitch?: string;
  /** Rough family, for grouping in pickers. */
  family: "Mario Kart" | "Mario Party" | "Nintendo" | "Pokémon" | "Fighting" | "Shooter" | "Party" | "Racing" | "Sports" | "Sandbox" | "Other";
}

export const GAME_CATALOG: CatalogEntry[] = [
  // ── Live: games we have randomizers, tools or rosters for ──────────────────
  { slug: "mario-kart-world", name: "Mario Kart World", status: "live", href: "/randomizers/mario-kart-world", family: "Mario Kart" },
  { slug: "mario-kart-8-deluxe", name: "Mario Kart 8 Deluxe", aliases: ["MK8DX", "Mario Kart 8"], status: "live", href: "/randomizers/mario-kart-8-deluxe", family: "Mario Kart" },
  { slug: "mario-kart-64", name: "Mario Kart 64", status: "live", href: "/randomizers/mario-kart-64", family: "Mario Kart" },
  { slug: "super-smash-bros-ultimate", name: "Super Smash Bros. Ultimate", aliases: ["Smash Ultimate", "Smash Bros"], status: "live", href: "/randomizers/super-smash-bros-ultimate", family: "Fighting" },
  { slug: "mario-party-series", name: "Mario Party", aliases: ["Mario Party series"], twitch: "Super Mario Party Jamboree", status: "live", href: "/randomizers/super-mario-party-jamboree", family: "Mario Party" },
  { slug: "super-mario-party-jamboree", name: "Super Mario Party Jamboree", aliases: ["Jamboree"], status: "live", href: "/randomizers/super-mario-party-jamboree", family: "Mario Party" },
  { slug: "mario-party-superstars", name: "Mario Party Superstars", status: "live", href: "/randomizers/mario-party-superstars", family: "Mario Party" },
  { slug: "mario-party-n64", name: "Mario Party (1998)", twitch: "Mario Party", appSlug: "mario-party", status: "live", href: "/randomizers/mario-party", family: "Mario Party" },
  { slug: "mario-party-2", name: "Mario Party 2", status: "live", href: "/randomizers/mario-party-2", family: "Mario Party" },
  { slug: "mario-party-3", name: "Mario Party 3", status: "live", href: "/randomizers/mario-party-3", family: "Mario Party" },
  { slug: "splatoon-3", name: "Splatoon 3", status: "live", href: "/randomizers/splatoon-3", family: "Shooter" },
  { slug: "kirby-air-riders", name: "Kirby Air Riders", status: "live", href: "/randomizers/kirby-air-riders", family: "Racing" },
  { slug: "overwatch", name: "Overwatch", aliases: ["Overwatch 2"], status: "live", href: "/randomizers/overwatch", family: "Shooter" },
  { slug: "marvel-rivals", name: "Marvel Rivals", status: "live", href: "/randomizers/marvel-rivals", family: "Shooter" },
  { slug: "goldeneye-007", name: "GoldenEye 007", twitch: "GoldenEye 007", status: "live", href: "/randomizers/goldeneye-007", family: "Shooter" },
  { slug: "perfect-dark", name: "Perfect Dark", status: "live", href: "/randomizers/perfect-dark", family: "Shooter" },
  { slug: "pokemon-stadium", name: "Pokémon Stadium", status: "live", href: "/randomizers/pokemon-stadium", family: "Pokémon" },
  { slug: "pokemon-stadium-2", name: "Pokémon Stadium 2", status: "live", href: "/randomizers/pokemon-stadium", family: "Pokémon" },
  { slug: "pokemon-firered-leafgreen", name: "Pokémon FireRed & LeafGreen", aliases: ["Pokémon Fire Red & Leaf Green", "Pokémon FireRed"], twitch: "Pokémon FireRed/LeafGreen", status: "live", href: "/randomizers/pokemon-firered-leafgreen", family: "Pokémon" },
  { slug: "pokemon-tcg", name: "Pokémon TCG", aliases: ["Pokémon Trading Card Game"], twitch: "Pokémon Trading Card Game", status: "live", href: "/tcg-companion", family: "Pokémon" },
  { slug: "pokemon-scarlet-violet", name: "Pokémon Scarlet & Violet", twitch: "Pokémon Scarlet/Violet", status: "live", href: "/help/streaming/chat-draft", family: "Pokémon" },
  { slug: "jackbox", name: "Jackbox", aliases: ["Jackbox Party Packs", "Jackbox Party Pack"], twitch: "Jackbox Party Packs", status: "live", href: "/game-nights/tools/jackbox-picker", family: "Party" },
  { slug: "street-fighter-6", name: "Street Fighter 6", status: "live", href: "/tournament/create", family: "Fighting" },
  { slug: "tekken-8", name: "Tekken 8", status: "live", href: "/tournament/create", family: "Fighting" },

  // ── Candidates: good randomizers or modes next ─────────────────────────────
  { slug: "super-mario-party", name: "Super Mario Party", status: "candidate", pitch: "Boards, characters and minigames on the party randomizer we already have.", family: "Mario Party" },
  { slug: "mario-kart-wii", name: "Mario Kart Wii", status: "candidate", pitch: "A kart combo and track randomizer, plus the custom track scene.", family: "Mario Kart" },
  { slug: "mario-kart-double-dash", name: "Mario Kart: Double Dash!!", twitch: "Mario Kart: Double Dash!!", status: "candidate", pitch: "Character pairs and karts: a pair roll no other game has.", family: "Mario Kart" },
  { slug: "super-smash-bros-melee", name: "Super Smash Bros. Melee", status: "candidate", pitch: "Fighters and the tournament stage list for the Melee scene.", family: "Fighting" },
  { slug: "mario-tennis-aces", name: "Mario Tennis Aces", status: "candidate", pitch: "Characters and courts for tennis nights.", family: "Sports" },
  { slug: "mario-golf-super-rush", name: "Mario Golf: Super Rush", status: "candidate", pitch: "Characters and courses, with a speed golf mode.", family: "Sports" },
  { slug: "mario-strikers-battle-league", name: "Mario Strikers: Battle League", status: "candidate", pitch: "Captains, teammates and gear builds for 4v4 nights.", family: "Sports" },
  { slug: "nintendo-switch-sports", name: "Nintendo Switch Sports", status: "candidate", pitch: "A sports and rules roll for a living room tournament.", family: "Sports" },
  { slug: "super-mario-bros-wonder", name: "Super Mario Bros. Wonder", status: "candidate", pitch: "Character, badge and level rolls for co-op challenge runs.", family: "Nintendo" },
  { slug: "luigis-mansion-3", name: "Luigi's Mansion 3", status: "candidate", pitch: "ScareScraper and ScreamPark floors and rules.", family: "Nintendo" },
  { slug: "warioware-move-it", name: "WarioWare: Move It!", status: "candidate", pitch: "Party modes and form rolls for game night.", family: "Party" },
  { slug: "pokemon-unite", name: "Pokémon Unite", status: "candidate", pitch: "Pokémon, held items and lanes, like the hero roulettes.", family: "Pokémon" },
  { slug: "pokemon-legends-z-a", name: "Pokémon Legends: Z-A", status: "candidate", pitch: "A run challenge in the style of the Fire Red one.", family: "Pokémon" },
  { slug: "pokemon-champions", name: "Pokémon Champions", status: "candidate", pitch: "Team rolls and drafts for the new battle game (Chat Draft has its roster).", family: "Pokémon" },
  { slug: "rocket-league", name: "Rocket League", status: "candidate", pitch: "Car, arena and mutator rolls.", family: "Sports" },
  { slug: "fall-guys", name: "Fall Guys", status: "candidate", pitch: "Round and challenge rolls for custom lobbies.", family: "Party" },
  { slug: "among-us", name: "Among Us", status: "candidate", pitch: "Map, roles and settings for a lobby with chat.", family: "Party" },
  { slug: "overcooked-2", name: "Overcooked! 2", status: "candidate", pitch: "Level and chef rolls for co-op nights.", family: "Party" },
  { slug: "pico-park", name: "PICO PARK", status: "candidate", pitch: "Level rolls for a big couch group.", family: "Party" },
  { slug: "gang-beasts", name: "Gang Beasts", status: "candidate", pitch: "Stage and mode rolls for a party brawl.", family: "Party" },
  { slug: "party-animals", name: "Party Animals", status: "candidate", pitch: "Animal and map rolls for a party brawl.", family: "Party" },
  { slug: "brawlhalla", name: "Brawlhalla", status: "candidate", pitch: "Legends and weapons for a free platform fighter.", family: "Fighting" },
  { slug: "rivals-of-aether-ii", name: "Rivals of Aether II", status: "candidate", pitch: "Fighters and stages for platform fighter nights.", family: "Fighting" },
  { slug: "guilty-gear-strive", name: "Guilty Gear -Strive-", status: "candidate", pitch: "A tournament roster like Street Fighter 6.", family: "Fighting" },
  { slug: "mortal-kombat-1", name: "Mortal Kombat 1", status: "candidate", pitch: "Fighters and Kameo partners: a pair roll.", family: "Fighting" },
  { slug: "dragon-ball-sparking-zero", name: "Dragon Ball: Sparking! Zero", twitch: "DRAGON BALL: Sparking! ZERO", status: "candidate", pitch: "A huge roster that suits a random-character tournament.", family: "Fighting" },
  { slug: "sonic-racing-crossworlds", name: "Sonic Racing: CrossWorlds", status: "candidate", pitch: "Racers, gadgets and world tracks for a kart randomizer.", family: "Racing" },
  { slug: "crash-team-racing", name: "Crash Team Racing Nitro-Fueled", status: "candidate", pitch: "Racers, karts and tracks.", family: "Racing" },
  { slug: "valorant", name: "VALORANT", status: "candidate", pitch: "Agents by role and maps, like the hero roulettes.", family: "Shooter" },
  { slug: "apex-legends", name: "Apex Legends", status: "candidate", pitch: "Legends by class and drop spots.", family: "Shooter" },
  { slug: "fortnite", name: "Fortnite", status: "candidate", pitch: "Drop spots, loadouts and challenge rules.", family: "Shooter" },
  { slug: "halo-infinite", name: "Halo Infinite", status: "candidate", pitch: "Weapons, maps and modes for custom games, like GoldenEye.", family: "Shooter" },
  { slug: "rainbow-six-siege", name: "Rainbow Six Siege", aliases: ["Tom Clancy's Rainbow Six Siege", "R6"], status: "candidate", pitch: "Operators by side and maps.", family: "Shooter" },
  { slug: "dead-by-daylight", name: "Dead by Daylight", status: "candidate", pitch: "Killer, survivor and perk builds.", family: "Other" },
  { slug: "lethal-company", name: "Lethal Company", status: "candidate", pitch: "Moon and challenge rolls for a crew.", family: "Party" },
  { slug: "minecraft", name: "Minecraft", status: "candidate", pitch: "Challenge seeds and rules for a run.", family: "Sandbox" },
  { slug: "league-of-legends", name: "League of Legends", status: "candidate", pitch: "Champions by role for ARAM-style chaos.", family: "Other" },
  { slug: "tetris-99", name: "Tetris 99", status: "candidate", pitch: "Theme and challenge rules for chat battles.", family: "Party" },

  // ── Listed: popular favorites ──────────────────────────────────────────────
  { slug: "animal-crossing-new-horizons", name: "Animal Crossing: New Horizons", status: "listed", family: "Nintendo" },
  { slug: "zelda-tears-of-the-kingdom", name: "The Legend of Zelda: Tears of the Kingdom", status: "listed", family: "Nintendo" },
  { slug: "zelda-breath-of-the-wild", name: "The Legend of Zelda: Breath of the Wild", status: "listed", family: "Nintendo" },
  { slug: "super-mario-odyssey", name: "Super Mario Odyssey", status: "listed", family: "Nintendo" },
  { slug: "donkey-kong-bananza", name: "Donkey Kong Bananza", status: "listed", family: "Nintendo" },
  { slug: "metroid-prime-4", name: "Metroid Prime 4: Beyond", status: "listed", family: "Nintendo" },
  { slug: "pikmin-4", name: "Pikmin 4", status: "listed", family: "Nintendo" },
  { slug: "stardew-valley", name: "Stardew Valley", status: "listed", family: "Other" },
  { slug: "hades-ii", name: "Hades II", status: "listed", family: "Other" },
  { slug: "balatro", name: "Balatro", status: "listed", family: "Other" },
  { slug: "elden-ring", name: "ELDEN RING", aliases: ["Elden Ring"], status: "listed", family: "Other" },
  { slug: "baldurs-gate-3", name: "Baldur's Gate 3", status: "listed", family: "Other" },
  { slug: "hollow-knight-silksong", name: "Hollow Knight: Silksong", status: "listed", family: "Other" },
  { slug: "call-of-duty", name: "Call of Duty: Black Ops 6", status: "listed", family: "Shooter" },
  { slug: "counter-strike-2", name: "Counter-Strike 2", twitch: "Counter-Strike", status: "listed", family: "Shooter" },
  { slug: "it-takes-two", name: "It Takes Two", status: "listed", family: "Party" },
  { slug: "split-fiction", name: "Split Fiction", status: "listed", family: "Party" },
  { slug: "phasmophobia", name: "Phasmophobia", status: "listed", family: "Party" },
  { slug: "golf-with-your-friends", name: "Golf With Your Friends", status: "listed", family: "Party" },
  { slug: "peak", name: "PEAK", status: "listed", family: "Party" },
  { slug: "repo", name: "R.E.P.O.", status: "listed", family: "Party" },
];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const BY_NAME = new Map<string, CatalogEntry>();
for (const g of GAME_CATALOG) for (const n of [g.name, ...(g.aliases ?? [])]) BY_NAME.set(norm(n), g);

/** The catalog entry for a stored or typed name (aliases count), or null for a custom ("Other") game. */
export function catalogGame(name: string | null | undefined): CatalogEntry | null {
  return name ? BY_NAME.get(norm(name)) ?? null : null;
}

/** The catalog entry for one of our app's game slugs (randomizers, live nights), or null. */
export function catalogForApp(slug: string | null | undefined): CatalogEntry | null {
  if (!slug) return null;
  return GAME_CATALOG.find((g) => g.appSlug === slug) ?? GAME_CATALOG.find((g) => g.slug === slug) ?? null;
}

/** Box art path for a game (by catalog entry or name), or null until it's pulled. */
export function boxArt(game: CatalogEntry | string | null | undefined): string | null {
  const g = typeof game === "string" ? catalogGame(game) : game;
  return g && BOX_ART[g.slug] ? `/images/box-art/${g.slug}.webp` : null;
}
