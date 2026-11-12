import { isProduction } from "@/lib/env";

/**
 * Games that are built but not public yet. A hidden game keeps all its code
 * and data; it's just left out of navigation, the sitemap, pickers (tournaments,
 * live nights, My Games, decks) and its pages return 404. Flip to true to launch.
 */
export const SMASH_PUBLIC = true;
export const SPLATOON_PUBLIC = true;
export const KIRBY_PUBLIC = true;
/** Pokémon Stadium 1 & 2 rental randomizer: type cards only (no art), so it can launch whenever it's reviewed. */
export const STADIUM_PUBLIC = true;
/** GoldenEye 007 multiplayer randomizer (beta; names only, "Image coming soon" slots). */
export const GOLDENEYE_PUBLIC = true;
/** Pokémon Fire Red/Leaf Green run challenge (beta; type cards). */
export const FRLG_PUBLIC = true;
/** Mario Kart 64 (N64 on Switch Online) on the Mario Kart randomizer (beta; no art yet). Hidden until reviewed. */
export const MK64_PUBLIC = true;
/** Perfect Dark Combat Simulator randomizer (beta). Hidden until reviewed. */
export const PERFECT_DARK_PUBLIC = true;
/** Hero roulettes (names only). Hidden until reviewed. */
export const OVERWATCH_PUBLIC = true;
export const MARVEL_RIVALS_PUBLIC = true;
/** Mario Party 1-3 (N64 on Switch Online) on the party randomizer (beta; no art yet). */
export const N64_PARTY_PUBLIC = true;
/** Sonic Racing: CrossWorlds randomizer (names only, "Image coming soon" slots; launched 2026-11-09). */
export const SONIC_PUBLIC = true;
/**
 * Mario Kart Wii on the Mario Kart randomizer (built 2026-11-11 with its game space; on 2026-11-12, Britton: open with
 * this release). Off = production 404s the page and leaves it out of lists, the sitemap and chat; development shows it.
 */
export const MKWII_PUBLIC = true;
/**
 * Pokémon Champions (game space picks 2026-11-11): the team builder (/pokemon-champions-team-builder), its chat roll
 * and the catalog's "live" status. Off = production 404s the builder, leaves it out of the sitemap and chat, and the
 * space stays staff only whatever its `opens` day says. On since 2026-11-12 (Britton: open with this release).
 */
export const POKEMON_CHAMPIONS_PUBLIC = true;
/** The team builder can be seen here (always outside production). */
export const championsShown = () => POKEMON_CHAMPIONS_PUBLIC || !isProduction;
/**
 * Super Smash Bros. Melee (game space picks 2026-11-11): the randomizer (/randomizers/super-smash-bros-melee), its chat
 * roll and match setup, tier lists, live nights and the tournament card. Staff only until Britton sets an opening day.
 * Off = production 404s the randomizer and leaves Melee out of lists, the sitemap and chat, and the space stays staff
 * only whatever its `opens` day says; development shows it all.
 */
export const MELEE_PUBLIC = false;
/** Melee can be seen here (always outside production). */
export const meleeShown = () => MELEE_PUBLIC || process.env.NODE_ENV !== "production";
/**
 * Super Mario Bros. Wonder (game space picks 2026-11-11): the challenge randomizer (/randomizers/super-mario-bros-wonder),
 * its chat roll and match setup, and the catalog's "live" status. Staff only until Britton sets an opening day. Off =
 * production 404s the randomizer and leaves it out of lists, the sitemap and chat, and the space stays staff only
 * whatever its `opens` day says; development shows the page and chat. Opening = this flag and the space's `opens`.
 */
export const WONDER_PUBLIC = false;
/** The Wonder randomizer can be seen here (always outside production). */
export const wonderShown = () => WONDER_PUBLIC || !isProduction;

/**
 * Mario Kart: Double Dash!! (Retro Mario Kart picks 2026-11-12): the randomizer (/randomizers/mario-kart-double-dash),
 * its help article, chat roll and match setup, tier lists, live nights, the tournament card and the catalog's "live"
 * status. Staff only until Britton sets an opening day. Off = production 404s the randomizer and its help article and
 * leaves Double Dash out of lists, the sitemap and chat, and the Retro Mario Kart space stays staff only whatever its
 * `opens` day says; development shows it all. Opening = this flag and the space's `opens`.
 */
export const DOUBLE_DASH_PUBLIC = false;
/** Double Dash can be seen here (always outside production). */
export const doubleDashShown = () => DOUBLE_DASH_PUBLIC || !isProduction;
/**
 * Mario Kart DS (Retro Mario Kart picks 2026-11-12, the space's third game): the randomizer (/randomizers/mario-kart-ds),
 * its help article, chat roll and match setup, tier lists, live nights, the tournament card and the catalog's "live"
 * status. It opens with the Retro Mario Kart space: staff only until Britton sets the space's opening day. Off =
 * production 404s the randomizer and its help article and leaves Mario Kart DS out of lists, the sitemap and chat;
 * development shows it all. Opening = this flag, DOUBLE_DASH_PUBLIC and the space's `opens`.
 */
export const MARIO_KART_DS_PUBLIC = false;
/** Mario Kart DS can be seen here (always outside production). */
export const marioKartDsShown = () => MARIO_KART_DS_PUBLIC || !isProduction;
/**
 * Mario Kart 7 and Super Mario Kart (Retro Mario Kart picks 2026-11-12, the space's fourth and fifth games): each
 * randomizer (/randomizers/mario-kart-7, /randomizers/super-mario-kart), its help article, chat roll and match setup,
 * tier lists, the tournament card and the catalog's "live" status (Mario Kart 7 is also a live-night game; Super
 * Mario Kart isn't, two players only). They open with the Retro Mario Kart space: staff only until Britton sets the
 * space's opening day. Off = production 404s the page and its help article and leaves the game out of lists, the
 * sitemap and chat; development shows it all. Opening = these flags, the space's other flags and its `opens`.
 */
export const MARIO_KART_7_PUBLIC = false;
export const mario7Shown = () => MARIO_KART_7_PUBLIC || !isProduction;
export const SUPER_MARIO_KART_PUBLIC = false;
export const superMarioKartShown = () => SUPER_MARIO_KART_PUBLIC || !isProduction;

/**
 * Guides (/guides): hidden until there are enough guides, with imagery, to
 * publish. Same treatment as a hidden game: out of the nav and sitemap, pages
 * 404 in production. Staff can still write them in Platform ▸ Guides.
 */
export const GUIDES_PUBLIC = false;

/** The Daily Dex (/daily-dex, guess the Pokémon): launched Oct 16, 2026 (DEX_EPOCH in src/lib/originals/daily.ts). */
export const DAILY_DEX_PUBLIC = true;
/** Fire Round (daily trivia, /daily-trivia): links from the dailies, the homepage and /trivia, and the sitemap. */
export const FIRE_ROUND_PUBLIC = true;
/** The Daily Duel (/daily-duel, a card duel against the trainer of the day): launched Oct 22, 2026 (DUEL_EPOCH in src/lib/originals/duel/rules.ts). */
export const DUEL_PUBLIC = true;
/**
 * Trainer Road (/pokemon-trainers, picks 2026-10-23): every Daily Duel trainer any time. Launched
 * 2026-10-23. Off = production 404s its pages, share images and API, leaves it out of the sitemap,
 * the menu, the homepage and the Daily Duel's links, and its cron builds nothing. Development always
 * shows the pages.
 */
export const ROAD_PUBLIC = true;
/** Trainer Road can be seen here (always in development). */
export const roadShown = () => ROAD_PUBLIC || process.env.NODE_ENV !== "production";

/**
 * Shuffle Kart (/kart, picks 2026-11-12): GameShuffle's own kart racer, a first playable prototype. Staff only for
 * now: off = production 404s /kart for everyone but staff (staff see it everywhere), and it stays out of the
 * sitemap and the menus; development shows it to everyone.
 */
export const KART_PUBLIC = false;
/** Shuffle Kart can be seen here: always outside production, and by staff anywhere. */
export const kartShown = (isStaff: boolean) => KART_PUBLIC || isStaff || !isProduction;

/**
 * Airtime (/airtime, working name): GameShuffle's jetpack side-scroller, a first playable slice. Staff only for now:
 * off = production 404s /airtime for everyone but staff (staff see it everywhere), and it stays out of the sitemap
 * and the menus; development shows it to everyone.
 */
export const AIRTIME_PUBLIC = false;
/** Airtime can be seen here: always outside production, and by staff anywhere. */
export const airtimeShown = (isStaff: boolean) => AIRTIME_PUBLIC || isStaff || !isProduction;

/**
 * Speedrunning (/speedrun, the OBS overlay at /run/<token>; picks 2026-11-09, launch picks 2026-11-10). On since the
 * launch release: /speedrun, the Studio's Speedrun tool and the sitemap. Off = production 404s /speedrun and leaves
 * it out of all three. The menus, footer, For streamers pages and chat games guide wait for the speedrun_listed switch
 * (src/lib/speedrun/listing.ts) after a quiet week. Development and the dev site always show everything.
 */
export const SPEEDRUN_PUBLIC = true;
/** Speedrunning can be seen here (always outside production). */
export const speedrunShown = () => SPEEDRUN_PUBLIC || !isProduction;

/** Hidden randomizers by slug, for lists that loop over every randomizer. */
const HIDDEN_RANDOMIZERS: Record<string, boolean> = {
  "super-smash-bros-ultimate": !SMASH_PUBLIC,
  "splatoon-3": !SPLATOON_PUBLIC,
  "kirby-air-riders": !KIRBY_PUBLIC,
  "pokemon-stadium": !STADIUM_PUBLIC,
  "goldeneye-007": !GOLDENEYE_PUBLIC,
  "pokemon-firered-leafgreen": !FRLG_PUBLIC,
  "mario-party": !N64_PARTY_PUBLIC,
  "mario-party-2": !N64_PARTY_PUBLIC,
  "mario-party-3": !N64_PARTY_PUBLIC,
  "mario-kart-64": !MK64_PUBLIC,
  "perfect-dark": !PERFECT_DARK_PUBLIC,
  "overwatch": !OVERWATCH_PUBLIC,
  "marvel-rivals": !MARVEL_RIVALS_PUBLIC,
  "sonic-racing-crossworlds": !SONIC_PUBLIC,
  "mario-kart-wii": !MKWII_PUBLIC,
  "super-smash-bros-melee": !MELEE_PUBLIC,
  // Not a randomizer page: this keeps its chat roll out of production until the space opens.
  "pokemon-champions": !POKEMON_CHAMPIONS_PUBLIC,
  "super-mario-bros-wonder": !WONDER_PUBLIC,
  "mario-kart-double-dash": !DOUBLE_DASH_PUBLIC,
  "mario-kart-ds": !MARIO_KART_DS_PUBLIC,
  "mario-kart-7": !MARIO_KART_7_PUBLIC,
  "super-mario-kart": !SUPER_MARIO_KART_PUBLIC,
};
export function randomizerPublic(slug: string): boolean {
  return !HIDDEN_RANDOMIZERS[slug];
}
