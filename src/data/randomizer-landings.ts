import type { AppFaq, AppFeature } from "@/data/marketing-apps";

/**
 * Landing copy for each game randomizer, rendered under the tool on its one
 * canonical URL (`/randomizers/[slug]`). These used to be separate marketing
 * pages at flat URLs (`/mario-kart-8-deluxe-randomizer` and friends), which
 * split rankings with the tools; those URLs now 308 here (next.config.ts).
 *
 * Keyword placement per page: the primary keyword leads the meta title, the
 * H1 (`h1`), the first sentence of the hero lead, and `featuresHeading`.
 * The FAQ feeds FAQPage JSON-LD verbatim, so keep answers plain text.
 */

export interface RandomizerLanding {
  /** Tool slug under /randomizers. */
  slug: string;
  path: string;
  /** Game name as players search it. */
  game: string;
  /** Full `<title>` (rendered absolute, no brand suffix). Keep it to 60 characters. */
  metaTitle: string;
  /** Keep it to 160 characters. */
  metaDescription: string;
  h1: string;
  /** Hero line under the H1. The first sentence carries the primary keyword. */
  lead: string;
  ogImage?: string;
  overview: string;
  featuresHeading: string;
  features: AppFeature[];
  /** An extra next step shown under the FAQ (the Pro/account nudge already follows). */
  nextStep?: { title: string; body: string; ctaLabel: string; ctaHref: string };
  faqHeading: string;
  faq: AppFaq[];
}

/** The card game, for anyone who came for a Pokémon video game randomizer. */
const POKEMON_TCG_STEP = {
  title: "The Pokémon card game",
  body: "Deck guides from beginner to competitive, singles, and a free companion that tracks damage and prizes at the table.",
  ctaLabel: "Visit the Pokémon TCG hub",
  ctaHref: "/pokemon-tcg",
};

const GAME_NIGHT_STEP = {
  title: "Plan a game night with Mario Party",
  body: "Invite your crew, see who's coming, and play on everyone's phones.",
  ctaLabel: "Plan a game night",
  ctaHref: "/game-nights/create",
};

export const RANDOMIZER_LANDINGS: Record<string, RandomizerLanding> = {
  "mario-kart-8-deluxe": {
    slug: "mario-kart-8-deluxe",
    path: "/randomizers/mario-kart-8-deluxe",
    game: "Mario Kart 8 Deluxe",
    metaTitle: "Mario Kart 8 Deluxe Randomizer: Karts, Tracks & Items",
    metaDescription:
      "Free Mario Kart 8 Deluxe randomizer. Random character, kart, wheels and glider combos for up to 12 players, plus track and item shuffles. No account needed.",
    h1: "Mario Kart 8 Deluxe Randomizer",
    lead: "A free Mario Kart 8 Deluxe randomizer for up to 12 players. Roll a kart combo for one player or everyone in the lobby, then shuffle the tracks and items.",
    ogImage: "https://www.gameshuffle.co/images/opengraph/mario-kart-8-deluxe-og.jpg",
    overview:
      "Use the MK8DX randomizer for a couch night where nobody races their main, an online lobby where everyone gets a random build, or house rules that change every cup.",
    featuresHeading: "What the Mario Kart 8 Deluxe randomizer does",
    features: [
      { icon: "layout-grid", title: "Full four-part kart combos", description: "A random character, vehicle, wheels and glider for every player." },
      { icon: "flag", title: "Track shuffler", description: "Up to 48 races from all 96 courses, with cup icons and a Tour-only filter." },
      { icon: "sparkles", title: "Item sets", description: "Pick which items are on, or roll a random set of any size." },
      { icon: "bolt", title: "Drift & weight filters", description: "Keep combos to one drift type or weight class." },
      { icon: "checks", title: "Only what you own", description: "Switch off Booster Course Pass waves, characters or parts you don't have, and rolls skip them." },
      { icon: "message", title: "Roll in Discord", description: "Roll combos in your server with /gs-randomize, then open them here." },
    ],
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Mario Kart 8 Deluxe randomizer free?", a: "Yes. It runs in any browser, phones included, with nothing to install and no account." },
      { q: "Does it include the DLC tracks and characters?", a: "Yes. All 96 tracks are in the pool, the 48 base tracks plus all 48 from the Booster Course Pass, along with the characters added during the pass, like Birdo, Petey Piranha, Funky Kong and Pauline. Don't have the pass? Press Choose what I have at the top of the randomizer and switch off any wave, character or part you don't own. Rolls skip everything you switch off, and your choices are saved for next time." },
    ],
  },

  "mario-kart-world": {
    slug: "mario-kart-world",
    path: "/randomizers/mario-kart-world",
    game: "Mario Kart World",
    metaTitle: "Mario Kart World Randomizer: Random Combos & Tracks",
    metaDescription:
      "Free Mario Kart World randomizer for up to 24 players. Random characters and kart combos, plus track and Knockout Tour shuffles. Save setups for game night.",
    h1: "Mario Kart World Randomizer",
    lead: "A free Mario Kart World randomizer for up to 24 players. Roll a character and kart for everyone, then shuffle the tracks, items and Knockout Tour rallies.",
    ogImage: "https://www.gameshuffle.co/images/opengraph/mario-kart-world-og.jpg",
    overview:
      "Use it to give a 24-player room random characters and vehicles, build a Grand Prix nobody picked, or choose tonight's rallies.",
    featuresHeading: "What the Mario Kart World randomizer does",
    features: [
      { icon: "layout-grid", title: "Character and vehicle", description: "A random character and vehicle for every player." },
      { icon: "bolt", title: "Vehicle-type filter", description: "Keep it to Karts, Bikes or ATVs." },
      { icon: "compass", title: "Track shuffler with overworld icons", description: "Randomize courses, shown with Mario Kart World's overworld map icons." },
      { icon: "award", title: "Knockout Tour rallies", description: "Roll which rallies to play." },
      { icon: "sparkles", title: "Item sets", description: "Pick which items are on, or roll a random set of any size." },
      { icon: "flag", title: "Race counts", description: "4, 6, 8, 12, 16 or 32 races." },
    ],
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Mario Kart World randomizer free?", a: "Yes. It runs in any browser, phones included, with nothing to install and no account." },
      { q: "Can it leave out characters I haven't unlocked?", a: "Yes. Press Choose what I have and switch off characters, vehicles or tracks you don't have yet. Rolls skip them, and your choices are kept for next time." },
    ],
  },

  "super-mario-party-jamboree": {
    slug: "super-mario-party-jamboree",
    path: "/randomizers/super-mario-party-jamboree",
    game: "Super Mario Party Jamboree",
    metaTitle: "Mario Party Jamboree Randomizer: Boards, Minigames & Rules",
    metaDescription:
      "Free Super Mario Party Jamboree randomizer. Roll the board, rules and turns, give everyone a character, and spin a minigame wheel. Works on Switch and Switch 2.",
    h1: "Super Mario Party Jamboree Randomizer",
    lead: "A free Super Mario Party Jamboree randomizer for up to four players. Roll the board, rules and turns, give everyone a character, and spin a minigame or a whole set list.",
    ogImage: "https://www.gameshuffle.co/images/opengraph/mario-party-jamboree-og.jpg",
    overview:
      "Use it to pick the board and rules before a party, or to run a minigames-only night from a set list.",
    featuresHeading: "What the Jamboree randomizer does",
    features: [
      { icon: "users", title: "Characters for everyone", description: "A different character for each player, standing on their own color, with CPUs filling empty seats." },
      { icon: "list", title: "Minigame nights", description: "Spin one minigame or draw a set list for a minigame-only night, with a win tally." },
      { icon: "device-desktop", title: "Switch or Switch 2 Edition", description: "The Switch 2 Edition adds Tag Team and Frenzy Rules and 20 minigames. Pick your version and the rolls match it." },
    ],
    nextStep: GAME_NIGHT_STEP,
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Super Mario Party Jamboree randomizer free?", a: "Yes. It runs in any browser, phones included, with nothing to install and no account." },
      { q: "Can it skip boards and characters I haven't unlocked?", a: "Yes. Western Land, Mario's Rainbow Castle, King Bowser's Keep, Pauline and Ninji stay off until you tick them, and your choice is remembered." },
      { q: "Can I add missions and a live scoreboard?", a: "Yes, as part of a game night. Set up a game night on GameShuffle and add Mario Party to it: Chance cards, missions and one scoreboard across your games, played live on everyone's phone. The randomizer itself just rolls." },
    ],
  },

  "mario-party-superstars": {
    slug: "mario-party-superstars",
    path: "/randomizers/mario-party-superstars",
    game: "Mario Party Superstars",
    metaTitle: "Mario Party Superstars Randomizer: Boards & 100 Minigames",
    metaDescription:
      "Free Mario Party Superstars randomizer. Roll one of five classic boards and the turns, assign characters, and spin all 100 minigames. Full lists included.",
    h1: "Mario Party Superstars Randomizer",
    lead: "A free Mario Party Superstars randomizer for up to four players. Roll one of the five classic boards and the turns, give everyone a character, and spin a minigame or a whole set list.",
    ogImage: "https://www.gameshuffle.co/images/opengraph/mario-party-superstars-og.jpg",
    overview:
      "Use it to settle which classic board to play tonight, or to run a minigames-only night from Mt. Minigames.",
    featuresHeading: "What the Mario Party Superstars randomizer does",
    features: [
      { icon: "users", title: "Characters for everyone", description: "A different character for each player, standing on their own color, with CPUs filling empty seats." },
      { icon: "list", title: "Minigame randomizer", description: "Spin one minigame or draw a set list from Mt. Minigames' 100 classics, with a win tally." },
      { icon: "checks", title: "Pick your boards", description: "Leave out any board you'd rather skip, and the randomizer remembers." },
      { icon: "star", title: "Nothing to unlock", description: "All five boards and all ten characters are open from the start, so any of them can come up." },
    ],
    nextStep: GAME_NIGHT_STEP,
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Mario Party Superstars randomizer free?", a: "Yes. It runs in any browser, phones included, with nothing to install and no account." },
      { q: "How many players can play Mario Party Superstars?", a: "The board game takes one to four players. Tag Match needs two to four, and Trio Challenge one to three." },
      { q: "Does it work on Switch 2?", a: "Yes. Mario Party Superstars plays on Switch 2 through backward compatibility, and the randomizer covers everything in the game." },
      { q: "Can I add missions and a live scoreboard?", a: "Yes, as part of a game night. Set up a game night on GameShuffle and add Mario Party to it: Chance cards, missions and one scoreboard across your games, played live on everyone's phone. The randomizer itself just rolls." },
    ],
  },

  "mario-party": {
    slug: "mario-party",
    path: "/randomizers/mario-party",
    ogImage: "https://www.gameshuffle.co/images/opengraph/mario-party-og.jpg",
    game: "Mario Party",
    metaTitle: "Mario Party Randomizer (N64): Boards, Characters & Minigames",
    metaDescription:
      "Free Mario Party randomizer for the Nintendo 64 original on Switch Online. Roll one of eight boards and the turns, give everyone a character, and spin all 50 minigames.",
    h1: "Mario Party Randomizer",
    lead: "A free randomizer for the original Mario Party, now on Nintendo Switch Online. Roll the board and turns, give up to four players a character, and spin a minigame or a whole set list.",
    overview:
      "Use it to pick tonight's board and turn count (Lite, Standard or Full Play), or to run a minigames-only night.",
    featuresHeading: "What the Mario Party randomizer does",
    features: [
      { icon: "users", title: "Characters for everyone", description: "A different character for each player, with CPUs filling empty seats." },
      { icon: "list", title: "Minigame randomizer", description: "Spin one minigame or draw a set list, with a win tally." },
      { icon: "checks", title: "Pick your boards", description: "Leave out any board you'd rather skip, and the randomizer remembers." },
    ],
    nextStep: GAME_NIGHT_STEP,
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Mario Party randomizer free?", a: "Yes. It runs in any browser, phones included, with nothing to install and no account." },
      { q: "Can I skip the stick-spinning minigames?", a: "Yes. Turn off Stick-spinning minigames and Tug o' War, Paddle Battle and Pedal Power stay out of the draw. On Switch Online the game warns you to spin with your thumb, not your palm." },
    ],
  },

  "mario-party-2": {
    slug: "mario-party-2",
    path: "/randomizers/mario-party-2",
    ogImage: "https://www.gameshuffle.co/images/opengraph/mario-party-2-og.jpg",
    game: "Mario Party 2",
    metaTitle: "Mario Party 2 Randomizer: Boards, Characters & Minigames",
    metaDescription:
      "Free Mario Party 2 randomizer for the N64 classic on Switch Online. Roll one of six lands and the turns, give everyone a character, and spin all 65 minigames.",
    h1: "Mario Party 2 Randomizer",
    lead: "A free Mario Party 2 randomizer for the N64 classic on Nintendo Switch Online. Roll the land and turns, give up to four players a character, and spin a minigame or a whole set list.",
    overview:
      "Use it to pick a land and turn count, or to run a minigames-only night.",
    featuresHeading: "What the Mario Party 2 randomizer does",
    features: [
      { icon: "users", title: "Characters for everyone", description: "A different character for each player, with CPUs filling empty seats." },
      { icon: "list", title: "Minigame randomizer", description: "Spin one minigame or draw a set list, with a win tally." },
      { icon: "checks", title: "Pick your boards", description: "Leave out any board you'd rather skip, and the randomizer remembers." },
    ],
    nextStep: GAME_NIGHT_STEP,
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Mario Party 2 randomizer free?", a: "Yes. It runs in any browser, phones included, with nothing to install and no account." },
      { q: "Does it include Battle, Item and Duel minigames?", a: "Yes. They're off by default because they only come up in certain situations on the board; turn their types on in the Minigame Randomizer." },
    ],
  },

  "mario-party-3": {
    slug: "mario-party-3",
    path: "/randomizers/mario-party-3",
    ogImage: "https://www.gameshuffle.co/images/opengraph/mario-party-3-og.jpg",
    game: "Mario Party 3",
    metaTitle: "Mario Party 3 Randomizer: Boards, Characters & Minigames",
    metaDescription:
      "Free Mario Party 3 randomizer for the N64 classic on Switch Online. Roll one of six Battle Royale boards and the turns, give everyone a character, and spin all 71 minigames.",
    h1: "Mario Party 3 Randomizer",
    lead: "A free Mario Party 3 randomizer for the N64 classic on Nintendo Switch Online. Roll a Battle Royale board and the turns, give up to four players a character, and spin a minigame or a whole set list.",
    overview:
      "The Switch Online release is Mario Party 3's first since the N64. Use it to pick a Battle Royale board and turn count, or to run a minigames-only night.",
    featuresHeading: "What the Mario Party 3 randomizer does",
    features: [
      { icon: "users", title: "Characters for everyone", description: "A different character for each player, with CPUs filling empty seats." },
      { icon: "list", title: "Minigame randomizer", description: "Spin one minigame or draw a set list, with a win tally." },
      { icon: "checks", title: "Pick your boards", description: "Leave out any board you'd rather skip, and the randomizer remembers." },
    ],
    nextStep: GAME_NIGHT_STEP,
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Mario Party 3 randomizer free?", a: "Yes. It runs in any browser, phones included, with nothing to install and no account." },
      { q: "Are Daisy and Waluigi in?", a: "Yes. Both are playable from the start in Party Mode, so the randomizer can pick them straight away." },
      { q: "Does it cover Duel Mode?", a: "Not yet. It rolls Battle Royale, the four-player board game." },
    ],
  },

  "super-smash-bros-ultimate": {
    slug: "super-smash-bros-ultimate",
    path: "/randomizers/super-smash-bros-ultimate",
    ogImage: "https://www.gameshuffle.co/images/opengraph/super-smash-bros-ultimate-og.jpg",
    game: "Super Smash Bros. Ultimate",
    metaTitle: "Smash Ultimate Randomizer: Fighters, Stages & Rules",
    metaDescription:
      "Free Super Smash Bros. Ultimate randomizer. Random fighters and costumes for up to 8 players, stages, rules, Custom Smash and Squad Strike squads.",
    h1: "Super Smash Bros. Ultimate Randomizer",
    lead: "A free Super Smash Bros. Ultimate randomizer for up to eight players. Hand out fighters, roll the stage and rules, and draw Squad Strike squads for the whole couch.",
    overview:
      "This Smash Ultimate randomizer sets up a whole Smash night. It hands out fighters and costumes for up to eight players from all 86 (only the DLC you own), rolls a stage from the competitive list or every stage with its form and hazards, picks Competitive or Party rules, rolls Custom Smash settings, and draws Squad Strike squads.",
    featuresHeading: "What the Smash Ultimate randomizer does",
    features: [
      { icon: "users", title: "Fighters for everyone", description: "A random fighter and costume for up to eight players, with echo, Mii and series filters." },
      { icon: "map", title: "Stage and rules roller", description: "Competitive legal stages or all of them, with Battlefield and Omega forms and hazards." },
      { icon: "refresh", title: "No repeats (Smashdown)", description: "Nobody plays the same fighter twice in a night until you reset it." },
      { icon: "layout-grid", title: "Squad Strike squads", description: "Three or five fighters per player." },
      { icon: "checks", title: "Only the DLC you own", description: "Tick the fighter packs you have and rolls leave the rest out. A free account remembers it." },
      { icon: "bookmark", title: "Save and share", description: "Save a setup to come back to, and share its link from My Stuff." },
    ],
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Smash Ultimate randomizer free?", a: "Yes. It is free and runs in your browser with no account required." },
      { q: "Does it include DLC fighters?", a: "Yes, once you tick the packs you own. Piranha Plant and both Fighters Passes each have their own switch, and a free account remembers them." },
      { q: "Can it pick only tournament-legal stages?", a: "Yes. Competitive rules use the common starter and counterpick list, with an option for stages some events allow." },
      { q: "Does it work for eight players?", a: "Yes. It hands out fighters to up to eight players (two can land on the same one, like the game), and you can reroll anyone." },
    ],
  },
  "splatoon-3": {
    slug: "splatoon-3",
    path: "/randomizers/splatoon-3",
    game: "Splatoon 3",
    metaTitle: "Splatoon 3 Randomizer: Weapons, Stages & Modes",
    metaDescription:
      "Free Splatoon 3 randomizer. A random weapon kit for up to 8 players from all 173, plus stages, modes, Salmon Run stages and Private Battle teams.",
    ogImage: "https://www.gameshuffle.co/images/opengraph/splatoon-3-og.jpg",
    h1: "Splatoon 3 Randomizer",
    lead: "A free Splatoon 3 randomizer for up to eight players. Hand out weapon kits, roll the mode and stage, pick a Salmon Run stage and split Alpha and Bravo for a Private Battle.",
    overview:
      "This Splatoon 3 randomizer sets up a Private Battle night. It hands every player a weapon kit (the main weapon with its sub and special) from all 173 kits, with class filters and an option for the replicas, rolls a mode and stage or a set of battles that never repeats a stage, picks a Salmon Run stage, and splits the lobby into Alpha and Bravo.",
    featuresHeading: "What the Splatoon 3 randomizer does",
    features: [
      { icon: "users", title: "A kit for everyone", description: "A random main, sub and special for up to eight players, all different." },
      { icon: "filter", title: "Class filters", description: "Shooters only, no chargers, or any mix of the eleven classes." },
      { icon: "map", title: "Modes and stages", description: "Turf War or the Anarchy modes on any of the 25 stages, one battle or a set." },
      { icon: "refresh", title: "No repeats tonight", description: "Nobody gets the same kit twice in a night until you reset it." },
      { icon: "layout-grid", title: "Alpha and Bravo", description: "Split the lobby into two teams for a Private Battle." },
      { icon: "bookmark", title: "Save and share", description: "Save a setup to come back to, and share its link from My Stuff." },
    ],
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Splatoon 3 randomizer free?", a: "Yes. It is free and runs in your browser with no account required." },
      { q: "Does it include every weapon?", a: "Yes, all 173 weapon kits up to the final update, including the Splatlands Collection. The replicas, which share another weapon's kit and mostly come with the Side Order DLC, are off unless you switch them on." },
      { q: "Can it pick the mode and stage too?", a: "Yes. Roll one battle or a set of three or five from Turf War, Splat Zones, Tower Control, Rainmaker and Clam Blitz, with no stage repeated in a set." },
      { q: "Does it do Salmon Run?", a: "It rolls one of the seven Salmon Run stages. Salmon Run hands out its own weapons in the game, so there's nothing else to roll." },
    ],
  },
  "kirby-air-riders": {
    slug: "kirby-air-riders",
    path: "/randomizers/kirby-air-riders",
    game: "Kirby Air Riders",
    metaTitle: "Kirby Air Riders Randomizer: Riders, Machines & Courses",
    metaDescription:
      "Free Kirby Air Riders randomizer. A random rider and machine for up to 8 players, plus Air Ride and Top Ride courses and City Trial Stadiums.",
    ogImage: "https://www.gameshuffle.co/images/opengraph/kirby-air-riders-og.jpg",
    h1: "Kirby Air Riders Randomizer",
    lead: "A free Kirby Air Riders randomizer for up to eight players. Put everyone on a random rider and machine, roll the Air Ride or Top Ride course, and pick the City Trial Stadium.",
    overview:
      "This Kirby Air Riders randomizer sets up a couch session on the Switch 2. It puts every player on a different rider from all 21, hands out machines from the Stars, Bikes, Chariots and Tanks (Legendary machines if you want them), rolls one of the 18 Air Ride courses or 9 Top Ride courses, and picks a City Trial Stadium by type.",
    featuresHeading: "What the Kirby Air Riders randomizer does",
    features: [
      { icon: "users", title: "Riders for everyone", description: "A different rider for up to eight players, from Kirby to Noir Dedede." },
      { icon: "star", title: "Machines by type", description: "Stars, Bikes, Chariots and Tanks, with the Legendary machines as an option." },
      { icon: "map", title: "Air Ride and Top Ride courses", description: "All 18 Air Ride courses or the 9 Top Ride courses." },
      { icon: "award", title: "City Trial Stadiums", description: "Battle, race, gliding, collecting or boss Stadiums." },
      { icon: "checks", title: "New save mode", description: "Only the riders, machines and courses open at the start." },
      { icon: "bookmark", title: "Save and share", description: "Save a setup to come back to, and share its link from My Stuff." },
    ],
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Kirby Air Riders randomizer free?", a: "Yes. It is free and runs in your browser with no account required." },
      { q: "Does it include every rider and machine?", a: "Yes, all 21 riders and every machine you can ride in a race or City Trial. Flight Warp Star is left out because it's only for Free Run, and the Legendary machines are off unless you switch them on." },
      { q: "I just started. Can it stick to what I've unlocked?", a: "Yes. New save mode only uses the four starting riders, the starting machines and the eight courses open from the start." },
      { q: "Does it pick City Trial events too?", a: "No. Events happen on their own during City Trial, so it rolls the Stadium you finish in." },
    ],
  },
  pokemon: {
    slug: "pokemon",
    path: "/randomizers/pokemon",
    ogImage: "https://www.gameshuffle.co/images/opengraph/pokemon-og.jpg",
    game: "Pokémon",
    metaTitle: "Random Pokémon Generator: Roll From All 1,025 Pokémon",
    metaDescription:
      "Free random Pokémon generator. Roll 1, 3 or 6 from all 1,025 Pokémon, filter by generation and type, and keep a team fully evolved or free of Legendaries.",
    h1: "Random Pokémon Generator",
    lead: "A random Pokémon generator for all 1,025 Pokémon. Roll one, three or a team of six, narrow it to a generation or a type, and re-roll any card on its own.",
    overview:
      "Use it to pick a team for a Nuzlocke or a challenge run, decide what to draw or build next, or meet a Pokémon you forgot existed. Every Pokémon from Bulbasaur to Pecharunt is in the mix, from Generation 1 (Kanto) to Generation 9 (Paldea). Filter to one generation or one type, keep it to fully evolved Pokémon, leave out Legendaries and Mythicals, or make sure no two share a type. Copy the link and anyone you send it to sees the same roll.",
    featuresHeading: "What the random Pokémon generator does",
    features: [
      { icon: "refresh", title: "All 1,025 Pokémon", description: "Every Pokémon from Generation 1 to 9, Bulbasaur to Pecharunt." },
      { icon: "filter", title: "Generation and type", description: "Roll from one region, one type, or both at once." },
      { icon: "checks", title: "Team-ready options", description: "Fully evolved only, no Legendaries or Mythicals, and no repeated types." },
      { icon: "layout-grid", title: "Re-roll one card", description: "Keep the Pokémon you like and roll the others one at a time." },
      { icon: "list", title: "Details on every card", description: "Category, height, weight, stage and generation for each Pokémon." },
      { icon: "share", title: "Share the roll", description: "Copy a link that shows the same Pokémon to anyone you send it to." },
    ],
    nextStep: POKEMON_TCG_STEP,
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the random Pokémon generator free?", a: "Yes. It is free and runs in your browser with no account required." },
      { q: "How many Pokémon are in it?", a: "All 1,025 Pokémon in the National Pokédex, through Scarlet and Violet's downloadable content (Pecharunt is number 1,025)." },
      { q: "Can I roll a random team of 6?", a: "Yes. Pick 6, then switch on No repeated types for a team that covers more types, or Fully evolved only for a team that's ready to battle." },
      { q: "Does it include Legendary and Mythical Pokémon?", a: "Yes, unless you switch on No Legendaries or Mythicals in the options." },
      { q: "Does it roll forms like Alolan or Mega Pokémon?", a: "No. It rolls each species once, by its National Pokédex number." },
      { q: "Can I use it for a Nuzlocke?", a: "Yes. For Fire Red or Leaf Green, try our run challenge too: it picks catches you can actually find before each gym." },
    ],
  },
  "pokemon-stadium": {
    slug: "pokemon-stadium",
    path: "/randomizers/pokemon-stadium",
    ogImage: "https://www.gameshuffle.co/images/opengraph/pokemon-stadium-og.jpg",
    game: "Pokémon Stadium",
    metaTitle: "Pokémon Stadium Rental Randomizer: Random Rental Teams",
    metaDescription:
      "Free Pokémon Stadium and Stadium 2 rental randomizer. A random team of 6 rental Pokémon for up to 4 players, legal for the cup you pick, with each rental's level and moves.",
    h1: "Pokémon Stadium Rental Randomizer",
    lead: "Random rental teams for Pokémon Stadium and Pokémon Stadium 2. Pick a cup and everyone gets 6 different rentals, ready to battle, with the moves listed so you can find each one in the rental menu.",
    overview:
      "On Nintendo Switch Online the Transfer Pak doesn't work, so rental Pokémon are how most people battle in Pokémon Stadium and Pokémon Stadium 2. This randomizer deals each player a team of 6 different rentals from the cup you pick: Pika, Petit, Poké or Prime Cup in Stadium, and Little, Poké or Prime Cup in Stadium 2. Every team is legal for its cup, and it can pick your 3 for you too.",
    featuresHeading: "What the Pokémon Stadium randomizer does",
    features: [
      { icon: "users", title: "A team for everyone", description: "6 different rentals for up to 4 players, with no repeats across players unless you want them." },
      { icon: "award", title: "Every cup", description: "Pika, Petit, Poké and Prime Cup in Stadium; Little, Poké and Prime Cup in Stadium 2." },
      { icon: "checks", title: "Always cup-legal", description: "Rentals sit at the bottom of each cup's level range, so every team and every pick of 3 is allowed." },
      { icon: "list", title: "Moves on every card", description: "Each rental's level and four moves, so you can find it in the game's rental menu." },
      { icon: "refresh", title: "Pick my 3 too", description: "Let the randomizer choose which 3 you battle with." },
      { icon: "bookmark", title: "Save and share", description: "Save a set of teams, or copy them for your chat or Discord." },
    ],
    nextStep: POKEMON_TCG_STEP,
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Pokémon Stadium randomizer free?", a: "Yes. It is free and runs in your browser with no account required." },
      { q: "Why rentals?", a: "Pokémon Stadium and Stadium 2 on Nintendo Switch Online can't connect to the Game Boy games (the Transfer Pak isn't supported), so rental Pokémon are the way to battle." },
      { q: "Are the teams legal for the cup?", a: "Yes. Each cup has its own rental list, and every rental is at the lowest level the cup allows, so any 6 work and any 3 stay under the cup's level limit." },
      { q: "What about Mew?", a: "Mew (and Celebi and Surfing Pikachu in Stadium 2) only unlock in Prime Cup Round 2. Switch on Round 2 rentals to include them." },
    ],
  },
  "goldeneye-007": {
    slug: "goldeneye-007",
    path: "/randomizers/goldeneye-007",
    ogImage: "https://www.gameshuffle.co/images/opengraph/goldeneye-007-og.jpg",
    game: "GoldenEye 007",
    metaTitle: "GoldenEye 007 Randomizer: Random Multiplayer Matches",
    metaDescription:
      "Free GoldenEye 007 multiplayer randomizer. Roll the scenario, map, weapon set, game length and a character for each of 2 to 4 players, with teams and a No Oddjob option.",
    h1: "GoldenEye 007 Randomizer",
    lead: "Roll a whole GoldenEye 007 multiplayer match: the scenario, a map that fits your player count, the weapon set, the game length and a character for everyone. Made for Nintendo Switch Online nights.",
    overview:
      "GoldenEye 007's multiplayer is back on Nintendo Switch Online. This randomizer sets up a match for 2 to 4 players: one of the 8 scenarios (team games included), a map that can take your player count, one of the 14 weapon sets, a game length the scenario allows, and a different character for each player, with teams when the scenario needs them. Turn on random handicaps or a cheat for chaos nights.",
    featuresHeading: "What the GoldenEye 007 randomizer does",
    features: [
      { icon: "refresh", title: "The whole match", description: "Scenario, map, weapon set and game length in one roll, always a combination the game allows." },
      { icon: "users", title: "Characters and teams", description: "A different character for each player, and teams for 2 vs 2, 3 vs 1 and 2 vs 1." },
      { icon: "filter", title: "New save mode", description: "Keep to the 6 maps and 8 characters open from the start." },
      { icon: "checks", title: "No Oddjob", description: "On by default: he's short enough that auto-aim shoots over his head." },
      { icon: "sparkles", title: "Chaos options", description: "Random health handicaps and a random multiplayer cheat." },
      { icon: "users", title: "Name your players", description: "Type everyone's name so each card says who plays who." },
    ],
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the GoldenEye 007 randomizer free?", a: "Yes. It is free and runs in your browser with no account required." },
      { q: "Does it know which maps I've unlocked?", a: "Turn on New save only to keep to the 6 maps open from the start. Facility, Bunker, Archives, Caverns and Egyptian unlock through Solo missions." },
      { q: "Why is No Oddjob on?", a: "Oddjob is the shortest character, so auto-aim tends to shoot over his head. Most groups ban him; switch it off if yours doesn't." },
      { q: "Can I change just the map or the weapons?", a: "Yes. Every part of the match has its own refresh button, and rolling the match never changes anyone's character." },
    ],
  },
  "mario-kart-64": {
    slug: "mario-kart-64",
    path: "/randomizers/mario-kart-64",
    ogImage: "https://www.gameshuffle.co/images/opengraph/mario-kart-64-og.jpg",
    game: "Mario Kart 64",
    metaTitle: "Mario Kart 64 Randomizer: Characters, Tracks & Battles",
    metaDescription:
      "Free Mario Kart 64 randomizer for the N64 classic on Nintendo Switch Online. A different character for up to 4 players, random tracks from all 16 courses, battle courses and items.",
    h1: "Mario Kart 64 Randomizer",
    lead: "Roll Mario Kart 64 the way the N64 plays it: a different character for up to four players, tracks from all four cups, and a battle course for Battle mode.",
    overview:
      "Use it to hand out characters nobody chose, play a Grand Prix of random tracks, or settle which battle course is next.",
    featuresHeading: "What the Mario Kart 64 randomizer does",
    features: [
      { icon: "filter", title: "Weight classes", description: "Keep it to light, medium or heavy racers." },
      { icon: "map", title: "All 16 tracks", description: "Roll a race list from the Mushroom, Flower, Star and Special Cups." },
      { icon: "flag", title: "Battle courses", description: "Big Donut, Block Fort, Double Deck or Skyscraper for Battle mode." },
      { icon: "list", title: "Item sets", description: "Pick or randomize which of the 14 items your group plays with." },
      { icon: "road", title: "Race counts", description: "4, 8, 12 or 16 races." },
    ],
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Mario Kart 64 randomizer free?", a: "Yes. It runs in any browser, phones included, with nothing to install and no account." },
      { q: "Is Mario Kart 64 on Nintendo Switch Online?", a: "Yes, with the Expansion Pack, since October 2021, including online play for up to four players." },
      { q: "Can it pick battle courses?", a: "Yes. Open the Battle tab, choose how many battles to play, and roll." },
    ],
  },
  "perfect-dark": {
    slug: "perfect-dark",
    path: "/randomizers/perfect-dark",
    ogImage: "https://www.gameshuffle.co/images/opengraph/perfect-dark-og.jpg",
    game: "Perfect Dark",
    metaTitle: "Perfect Dark Randomizer: Random Combat Simulator Matches",
    metaDescription:
      "Free Perfect Dark Combat Simulator randomizer. Roll the scenario, arena, weapon set, time limit and simulants, plus a character for each of up to 4 players, with teams and chaos options.",
    h1: "Perfect Dark Randomizer",
    lead: "Roll a whole Perfect Dark Combat Simulator match: the scenario, arena, weapon set, time limit and simulants, plus a character for everyone. Made for Nintendo Switch Online nights.",
    overview:
      "Perfect Dark is on Nintendo Switch Online + Expansion Pack with online play. This randomizer sets up a Combat Simulator match for 1 to 4 players: one of the 6 scenarios, one of the 16 arenas (including the GoldenEye classics Temple, Complex and Felicity), one of the 12 weapon sets, a time limit, and up to 8 simulants with their difficulty and, if you like, special types such as KazeSim or PeaceSim. Team scenarios split everyone into two teams, and New save only keeps to what's open on a fresh file.",
    featuresHeading: "What the Perfect Dark randomizer does",
    features: [
      { icon: "refresh", title: "The whole match", description: "Scenario, arena, weapon set, time limit and simulants in one roll, each with its own refresh button." },
      { icon: "users", title: "Simulants", description: "Up to 8 bots with a difficulty from MeatSim to DarkSim, and special types if you want them." },
      { icon: "layout-grid", title: "Teams", description: "King of the Hill and Capture the Case split players and simulants into two teams." },
      { icon: "filter", title: "New save mode", description: "Keep to the arenas, scenarios and simulants open from the start." },
      { icon: "sparkles", title: "Chaos options", description: "One-Hit Kills, Slow Motion, Paintball and more." },
      { icon: "users", title: "Name your players", description: "Type everyone's name so each card says who plays who." },
    ],
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Perfect Dark randomizer free?", a: "Yes. It is free and runs in your browser with no account required." },
      { q: "Does it know what I've unlocked?", a: "Turn on New save only to keep to what a fresh save has: Skedar, Pipes and Area 52, Combat and King of the Hill, up to 4 simulants and the easier difficulties. The rest opens through Combat Simulator challenges." },
      { q: "Is Perfect Dark on Nintendo Switch Online?", a: "Yes, in the Expansion Pack's mature-rated Nintendo 64 app since June 2024, with online play." },
      { q: "Can two players both get Joanna?", a: "No. Joanna counts as one character, so at most one player gets her, in a random outfit (Arctic, Wet Suit, Party Frock and the rest). Elvis and Carrington's second outfits work the same way." },
    ],
  },
  "overwatch": {
    slug: "overwatch",
    path: "/randomizers/overwatch",
    ogImage: "https://www.gameshuffle.co/images/opengraph/overwatch-og.jpg",
    game: "Overwatch",
    metaTitle: "Overwatch Hero Randomizer: Random Hero Roulette",
    metaDescription:
      "Free Overwatch hero randomizer. A random hero for up to six players, with role queue (1 Tank, 2 Damage, 2 Support), role filters, no repeats across a night, and a random map.",
    h1: "Overwatch Hero Randomizer",
    lead: "Hero roulette for Overwatch: a random hero for you or your whole stack, with role queue, no repeats across the night, and a random map.",
    overview:
      "Roll a hero for each player, up to a six-stack, from the full Overwatch roster. Turn on role queue and every seat gets the role the game's 5v5 queue puts there (1 Tank, 2 Damage, 2 Support), limit the pool to certain roles, or play a no-repeats night where nobody plays the same hero twice. The map roll picks from the Standard map pool, filtered by mode.",
    featuresHeading: "What the Overwatch hero randomizer does",
    features: [
      { icon: "users", title: "Your whole stack", description: "A different hero for each of up to six players." },
      { icon: "layout-grid", title: "Role queue", description: "1 Tank, 2 Damage, 2 Support, like the game's 5v5 queue." },
      { icon: "filter", title: "Role filters", description: "Only Tanks, only Supports, or any mix." },
      { icon: "checks", title: "No repeats tonight", description: "Nobody plays the same hero twice until the pool runs out." },
      { icon: "map", title: "Random map", description: "From the Standard map pool, filtered by mode." },
      { icon: "users", title: "Name your players", description: "Type everyone's name so each card says whose hero it is." },
    ],
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Overwatch hero randomizer free?", a: "Yes. It is free and runs in your browser with no account required." },
      { q: "Does it have the newest heroes?", a: "The roster is checked against the game and new heroes join on their release day. The date of the last check is shown above the randomizer." },
      { q: "Why are there no hero pictures?", a: "Heroes show as role-coloured tiles with their names for now, which keeps a whole team easy to read on a phone. Portraits may come later." },
    ],
  },
  "marvel-rivals": {
    slug: "marvel-rivals",
    path: "/randomizers/marvel-rivals",
    ogImage: "https://www.gameshuffle.co/images/opengraph/marvel-rivals-og.jpg",
    game: "Marvel Rivals",
    metaTitle: "Marvel Rivals Hero Randomizer: Heroes, Team-Ups & Maps",
    metaDescription:
      "Free Marvel Rivals hero randomizer. A random hero for up to six players, a team built around a random Team-Up, role filters, no repeats across a night, and a random map.",
    h1: "Marvel Rivals Hero Randomizer",
    lead: "Hero roulette for Marvel Rivals: a random hero for your whole team, a team built around a Team-Up, no repeats across the night, and a random map.",
    overview:
      "Roll a hero for each player, up to a full team of six, from the whole Marvel Rivals roster. Limit the pool to Vanguards, Duelists or Strategists, play a no-repeats night, or roll a team built around one of the game's Team-Ups so the pair that makes it work is already on your side. The map roll picks from the core Convergence, Convoy and Domination maps.",
    featuresHeading: "What the Marvel Rivals hero randomizer does",
    features: [
      { icon: "users", title: "Your whole team", description: "A different hero for each of up to six players." },
      { icon: "sparkles", title: "Team-Up teams", description: "A random Team-Up, with its pair of heroes on your team." },
      { icon: "filter", title: "Role filters", description: "Vanguards, Duelists, Strategists, or any mix." },
      { icon: "checks", title: "No repeats tonight", description: "Nobody plays the same hero twice until the pool runs out." },
      { icon: "map", title: "Random map", description: "From the core Convergence, Convoy and Domination maps." },
      { icon: "users", title: "Name your players", description: "Type everyone's name so each card says whose hero it is." },
    ],
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Marvel Rivals hero randomizer free?", a: "Yes. It is free and runs in your browser with no account required." },
      { q: "How do the Team-Up teams work?", a: "Since July 2026, a Team-Up is a pair: one hero equips it and a named partner on the team switches on its extra effect. The randomizer picks a Team-Up, puts both heroes on your team and fills the rest at random." },
      { q: "Does it have the newest heroes?", a: "The roster is checked against the game and new heroes join on their release day. The date of the last check is shown above the randomizer." },
      { q: "Why are there no hero pictures?", a: "Heroes show as role-coloured tiles with their names for now, which keeps a whole team easy to read on a phone. Portraits may come later." },
    ],
  },
  "pokemon-firered-leafgreen": {
    slug: "pokemon-firered-leafgreen",
    path: "/randomizers/pokemon-firered-leafgreen",
    ogImage: "https://www.gameshuffle.co/images/opengraph/pokemon-firered-leafgreen-og.jpg",
    game: "Pokémon Fire Red and Leaf Green",
    metaTitle: "Pokémon Fire Red & Leaf Green Run Challenge: Random Runs",
    metaDescription:
      "Free Pokémon Fire Red and Leaf Green run challenge. A random starter, Pokémon to catch before every gym, and a level cap and team size for each leader, all catchable on your version. Share the run as a link.",
    h1: "Pokémon Fire Red & Leaf Green Run Challenge",
    lead: "A Nuzlocke-style run through Kanto. You get a starter, a list of Pokémon to catch before every gym, and a level cap and team size for each leader. Every run is a link you can share.",
    overview:
      "Fire Red and Leaf Green are back on Nintendo Switch as standalone eShop releases. This run challenge builds a fresh playthrough from a seed: the starter you must take, one or two Pokémon to catch before each gym (always ones you can reach and catch by then on your version, at a level you can use), a level cap at the leader's strongest Pokémon, a team-size limit and an optional twist. Trade evolutions are flagged, since most people can't trade on Switch. Tick things off as you go; the checklist is saved in your browser.",
    featuresHeading: "What the run challenge does",
    features: [
      { icon: "refresh", title: "A seeded run", description: "The same seed always builds the same run, so friends can race the exact same challenge." },
      { icon: "filter", title: "Catchable by then", description: "Every target can be caught before that gym on your version, at a level under the cap." },
      { icon: "checks", title: "Gym rules", description: "A level cap at the leader's ace, a team-size limit and an optional twist for every gym." },
      { icon: "sparkles", title: "No trades needed", description: "Kadabra, Machoke, Graveler and Haunter are flagged: they stop evolving without a trade." },
      { icon: "share", title: "Share the link", description: "A link that opens the exact same run, to race a friend or let chat follow along." },
      { icon: "users", title: "Checklist", description: "Tick off catches and badges as you go; saved in your browser per run." },
    ],
    nextStep: POKEMON_TCG_STEP,
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the run challenge free?", a: "Yes. It is free and runs in your browser with no account required." },
      { q: "Does it work for both versions?", a: "Yes. Pick Fire Red or Leaf Green and the catches only use Pokémon found in that version." },
      { q: "What does the level cap mean?", a: "It's the level of the leader's strongest Pokémon. Don't take anything higher into that fight." },
      { q: "Is this a Nuzlocke?", a: "It's a Nuzlocke-style run: set catches before every gym, a level cap for each leader and a limit on your team size. You play it on your own copy of the game, and you can add your own Nuzlocke rules on top, like catching only the first Pokémon you meet in each area or releasing any Pokémon that faints." },
      { q: "Why are there no Pokémon pictures?", a: "The challenge is in beta and uses type cards: the Pokémon's number, name and type colors." },
    ],
  },
};

/** Exact-match anchors for cross-links, in display order. */
export const RANDOMIZER_LINKS: { slug: string; label: string; href: string }[] = [
  { slug: "mario-kart-8-deluxe", label: "Mario Kart 8 Deluxe Randomizer", href: "/randomizers/mario-kart-8-deluxe" },
  { slug: "mario-kart-world", label: "Mario Kart World Randomizer", href: "/randomizers/mario-kart-world" },
  { slug: "super-mario-party-jamboree", label: "Mario Party Jamboree Randomizer", href: "/randomizers/super-mario-party-jamboree" },
  { slug: "mario-party-superstars", label: "Mario Party Superstars Randomizer", href: "/randomizers/mario-party-superstars" },
  { slug: "mario-party", label: "Mario Party Randomizer", href: "/randomizers/mario-party" },
  { slug: "mario-party-2", label: "Mario Party 2 Randomizer", href: "/randomizers/mario-party-2" },
  { slug: "mario-party-3", label: "Mario Party 3 Randomizer", href: "/randomizers/mario-party-3" },
  { slug: "super-smash-bros-ultimate", label: "Smash Ultimate Randomizer", href: "/randomizers/super-smash-bros-ultimate" },
  { slug: "splatoon-3", label: "Splatoon 3 Randomizer", href: "/randomizers/splatoon-3" },
  { slug: "kirby-air-riders", label: "Kirby Air Riders Randomizer", href: "/randomizers/kirby-air-riders" },
  { slug: "pokemon-stadium", label: "Pokémon Stadium Randomizer", href: "/randomizers/pokemon-stadium" },
  { slug: "goldeneye-007", label: "GoldenEye 007 Randomizer", href: "/randomizers/goldeneye-007" },
  { slug: "pokemon-firered-leafgreen", label: "Fire Red & Leaf Green Run Challenge", href: "/randomizers/pokemon-firered-leafgreen" },
  { slug: "mario-kart-64", label: "Mario Kart 64 Randomizer", href: "/randomizers/mario-kart-64" },
  { slug: "perfect-dark", label: "Perfect Dark Randomizer", href: "/randomizers/perfect-dark" },
  { slug: "overwatch", label: "Overwatch Hero Randomizer", href: "/randomizers/overwatch" },
  { slug: "marvel-rivals", label: "Marvel Rivals Hero Randomizer", href: "/randomizers/marvel-rivals" },
];

/**
 * Page metadata for a randomizer. The title is absolute: it already names the
 * game and fits in 60 characters, and the " | GameShuffle" suffix would push
 * it past that.
 */
export function randomizerMetadata(slug: string): import("next").Metadata {
  const l = RANDOMIZER_LANDINGS[slug];
  const canonical = `https://www.gameshuffle.co${l.path}`;
  return {
    title: { absolute: l.metaTitle },
    description: l.metaDescription,
    openGraph: { title: l.metaTitle, description: l.metaDescription, url: canonical, ...(l.ogImage ? { images: [l.ogImage] } : {}) },
    twitter: { card: "summary_large_image", title: l.metaTitle, description: l.metaDescription, ...(l.ogImage ? { images: [l.ogImage] } : {}) },
    alternates: { canonical },
  };
}
