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

const GAME_NIGHT_STEP = {
  title: "Hosting a game night?",
  body: "Set up a game night on GameShuffle to invite your crew, track who's coming, and add Mario Party with Chance cards, missions and one scoreboard across the night.",
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
    lead: "A free Mario Kart 8 Deluxe randomizer for up to 12 players. Roll a kart combo for one player or the whole lobby, then shuffle the tracks and items.",
    ogImage: "https://cdn.empac.co/gameshuffle/images/opengraph/mk8dx-randomizer-og.jpg",
    overview:
      "This Mario Kart 8 Deluxe randomizer builds a random four-part kart combo (character, vehicle, wheels and glider) for everyone at the table, then shuffles the tracks and items for your races. Whether you call it a Mario Kart 8 randomizer or an MK8DX randomizer, it handles up to 12 players, a tour-only track filter, drift and weight filters, and race counts up to 48. Open it in any browser, hit randomize, and play.",
    featuresHeading: "What the Mario Kart 8 Deluxe randomizer does",
    features: [
      { icon: "layout-grid", title: "Full four-part kart combos", description: "A random character, vehicle, wheels, and glider for every player, up to 12 at once." },
      { icon: "flag", title: "Track shuffler", description: "Randomize the courses for your races, with optional cup icons and a tour-only filter." },
      { icon: "sparkles", title: "Item randomizer", description: "Shuffle item sets to spice up house rules and keep races unpredictable." },
      { icon: "bolt", title: "Drift & weight filters", description: "Constrain combos by drift type and build rules for fairer or wackier races." },
      { icon: "bookmark", title: "Save your setups", description: "Save kart builds, item sets, and full game-night setups to reuse later." },
      { icon: "share", title: "Share & deep-link", description: "Share a config link, or open combos straight from the GameShuffle Discord bot." },
    ],
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Mario Kart 8 Deluxe randomizer free?", a: "Yes. The randomizer is completely free and runs in your browser with no account required." },
      { q: "How many players does it support?", a: "Up to 12 players per round, each getting their own random character, vehicle, wheels, and glider combo." },
      { q: "Can I randomize tracks and items too?", a: "Yes. You can shuffle tracks (with a tour-only filter and optional cup icons) and randomize item sets alongside the kart combos." },
      { q: "Can I re-roll just one player's combo?", a: "Yes. You can re-roll any individual slot without re-rolling everyone else." },
      { q: "Does it work on mobile?", a: "Yes. The randomizer runs in any modern mobile or desktop browser." },
    ],
  },

  "mario-kart-world": {
    slug: "mario-kart-world",
    path: "/randomizers/mario-kart-world",
    game: "Mario Kart World",
    metaTitle: "Mario Kart World Randomizer: Characters, Karts & Tracks",
    metaDescription:
      "Free Mario Kart World randomizer for up to 24 players. Random characters and kart combos, plus track and Knockout Tour shuffles. Save setups for game night.",
    h1: "Mario Kart World Randomizer",
    lead: "A free Mario Kart World randomizer for up to 24 players. Roll a character and kart for everyone, then shuffle the tracks, items and Knockout Tour rallies.",
    ogImage: "https://cdn.empac.co/gameshuffle/images/opengraph/mkworld-randomizer-og.jpg",
    overview:
      "This Mario Kart World randomizer creates random character-and-kart pairings for up to 24 players, then shuffles tracks, items, and Knockout Tour rallies. It supports vehicle-type filters (Kart, Bike, and ATV), overworld map icons for tracks, and race counts of 4, 6, 8, 12, 16, or 32. Open it, randomize, and race.",
    featuresHeading: "What the Mario Kart World randomizer does",
    features: [
      { icon: "layout-grid", title: "Character & kart combos", description: "Random character-and-vehicle pairings for up to 24 players per round." },
      { icon: "bolt", title: "Vehicle-type filter", description: "Limit the pool to Karts, Bikes, or ATVs to match your house rules." },
      { icon: "compass", title: "Track shuffler with overworld icons", description: "Randomize courses, shown with Mario Kart World's overworld map icons." },
      { icon: "award", title: "Knockout Tour support", description: "Shuffle Knockout Tour rallies, not just standard races." },
      { icon: "sparkles", title: "Item randomizer", description: "Mix up item rules to keep every race unpredictable." },
      { icon: "bookmark", title: "Save & share", description: "Save your setups and share a config link with the lobby." },
    ],
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Mario Kart World randomizer free?", a: "Yes. It is completely free and runs in your browser with no account required." },
      { q: "How many players does it support?", a: "Up to 24 players per round, each getting a random character and kart." },
      { q: "Does it support Knockout Tour?", a: "Yes. The randomizer shuffles Knockout Tour rallies as well as standard races." },
      { q: "Can I filter by vehicle type?", a: "Yes. You can limit combos to Karts, Bikes, or ATVs." },
      { q: "What race counts are available?", a: "You can choose 4, 6, 8, 12, 16, or 32 races." },
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
      "This Super Mario Party Jamboree randomizer rolls everything you need to start. It picks one of the seven boards, Party or Pro Rules, the turn count and the Bonus Star mode, gives up to four players (plus CPUs) a different character each, and spins minigames from all 112 in the base game, or 132 with the Switch 2 Edition.",
    featuresHeading: "What the Jamboree randomizer does",
    features: [
      { icon: "map", title: "Board and rules roller", description: "Board, ruleset, turns and Bonus Stars in one roll. Lock anything you want to keep." },
      { icon: "users", title: "Characters for everyone", description: "A different character for each player, standing on their own colour, with CPUs filling empty seats." },
      { icon: "list", title: "Minigame randomizer", description: "Spin one minigame or draw a set list for a minigame-only night, with a win tally." },
      { icon: "device-desktop", title: "Switch or Switch 2", description: "Pick your version and only see the rules and minigames you actually have." },
      { icon: "checks", title: "Only what you've unlocked", description: "Tell it which boards and characters you have, and rolls skip the rest. A free account remembers it everywhere." },
      { icon: "bookmark", title: "Save and share", description: "Save a setup to come back to, or send a link to everyone at the table." },
    ],
    nextStep: GAME_NIGHT_STEP,
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Super Mario Party Jamboree randomizer free?", a: "Yes. It is free and runs in your browser with no account required. An account only matters if you want to save setups." },
      { q: "How many minigames are in Super Mario Party Jamboree?", a: "112 in the base game. The Switch 2 Edition adds 20 more (mouse-control and Bowser Live minigames), for 132 in total." },
      { q: "Does it work with the Switch 2 Edition?", a: "Yes. Choose your version at the top. The Switch 2 Edition adds Tag Team and Frenzy Rules and 20 extra minigames; on the original Switch they stay hidden." },
      { q: "Can it skip boards I haven't unlocked?", a: "Yes. Western Land, Mario's Rainbow Castle and King Bowser's Keep are off until you tick them, and the randomizer remembers your choice." },
      { q: "Does it pick different characters for everyone?", a: "Yes. Like the game, no two players get the same character. Pauline and Ninji only join once you mark them unlocked." },
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
      "This Mario Party Superstars randomizer rolls everything you need to start. It picks one of the five Nintendo 64 boards, the turn count and the Bonus Star mode, gives up to four players (plus CPUs) a different character each, and spins from all 100 minigames (plus the five Item minigames).",
    featuresHeading: "What the Mario Party Superstars randomizer does",
    features: [
      { icon: "map", title: "Board and turns roller", description: "One of the five classic boards, the turn count and Bonus Stars in one roll." },
      { icon: "users", title: "Characters for everyone", description: "A different character for each player, standing on their own colour, with CPUs filling empty seats." },
      { icon: "list", title: "Minigame randomizer", description: "Spin one minigame or draw a set list from Mt. Minigames' 100 classics, with a win tally." },
      { icon: "checks", title: "Pick your boards", description: "Leave out any board you'd rather skip, and the randomizer remembers." },
      { icon: "device-mobile", title: "Works on any screen", description: "Run it on a phone, tablet or the TV browser. No account needed." },
      { icon: "bookmark", title: "Save and share", description: "Save a setup to come back to, or send a link to everyone at the table." },
    ],
    nextStep: GAME_NIGHT_STEP,
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Mario Party Superstars randomizer free?", a: "Yes. It is free and runs in your browser with no account required." },
      { q: "How many players can play Mario Party Superstars?", a: "Up to four on one Switch. The board game takes one to four players, with CPUs filling any empty seats. Tag Match needs two to four, and Trio Challenge takes one to three." },
      { q: "What can you unlock in Mario Party Superstars?", a: "No boards or characters. All five boards and all ten characters are playable from the start, so the randomizer can roll any of them straight away." },
      { q: "Does it work on Switch 2?", a: "Yes. Mario Party Superstars plays on Switch 2 through backward compatibility, and the randomizer covers everything in the game." },
      { q: "Which boards does it pick from?", a: "All five: Yoshi's Tropical Island, Space Land, Peach's Birthday Cake, Woody Woods and Horror Land. Untick any you want to skip." },
      { q: "Does it pick different characters for everyone?", a: "Yes. Like the game, no two players get the same character." },
      { q: "Can I add missions and a live scoreboard?", a: "Yes, as part of a game night. Set up a game night on GameShuffle and add Mario Party to it: Chance cards, missions and one scoreboard across your games, played live on everyone's phone. The randomizer itself just rolls." },
    ],
  },

  "super-smash-bros-ultimate": {
    slug: "super-smash-bros-ultimate",
    path: "/randomizers/super-smash-bros-ultimate",
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
      { icon: "layout-grid", title: "Squad Strike squads", description: "Three or five fighters per player, no overlaps." },
      { icon: "checks", title: "Only the DLC you own", description: "Tick the fighter packs you have and rolls leave the rest out. A free account remembers it." },
      { icon: "bookmark", title: "Save and share", description: "Save a setup to come back to, or send a link to the whole couch." },
    ],
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Smash Ultimate randomizer free?", a: "Yes. It is free and runs in your browser with no account required." },
      { q: "Does it include DLC fighters?", a: "Yes, once you tick the packs you own. Piranha Plant and both Fighters Passes each have their own switch, and a free account remembers them." },
      { q: "Can it pick only tournament-legal stages?", a: "Yes. Competitive rules use the common starter and counterpick list, with an option for stages some events allow." },
      { q: "Does it work for eight players?", a: "Yes. It hands out different fighters to up to eight players, and you can reroll anyone." },
    ],
  },
  "splatoon-3": {
    slug: "splatoon-3",
    path: "/randomizers/splatoon-3",
    game: "Splatoon 3",
    metaTitle: "Splatoon 3 Randomizer: Weapons, Stages & Modes",
    metaDescription:
      "Free Splatoon 3 randomizer. A random weapon kit for up to 8 players from all 173, plus stages, modes, Salmon Run stages and Private Battle teams.",
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
      { icon: "bookmark", title: "Save and share", description: "Save a setup to come back to, or send a link to the whole lobby." },
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
      { icon: "bookmark", title: "Save and share", description: "Save a setup to come back to, or send a link to the couch." },
    ],
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Kirby Air Riders randomizer free?", a: "Yes. It is free and runs in your browser with no account required." },
      { q: "Does it include every rider and machine?", a: "Yes, all 21 riders and every machine you can ride in a race or City Trial. Flight Warp Star is left out because it's only for Free Run, and the Legendary machines are off unless you switch them on." },
      { q: "I just started. Can it stick to what I've unlocked?", a: "Yes. New save mode only uses the four starting riders, the starting machines and the eight courses open from the start." },
      { q: "Does it pick City Trial events too?", a: "No. Events happen on their own during City Trial, so it rolls the Stadium you finish in." },
    ],
  },
  "pokemon-stadium": {
    slug: "pokemon-stadium",
    path: "/randomizers/pokemon-stadium",
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
      { icon: "dice", title: "Pick my 3 too", description: "Let the randomizer choose which 3 you battle with." },
      { icon: "bookmark", title: "Save and share", description: "Save a set of teams, or copy them for your chat or Discord." },
    ],
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Pokémon Stadium randomizer free?", a: "Yes. It is free and runs in your browser with no account required." },
      { q: "Why rentals?", a: "Pokémon Stadium and Stadium 2 on Nintendo Switch Online can't connect to the Game Boy games (the Transfer Pak isn't supported), so rental Pokémon are the way to battle." },
      { q: "Are the teams legal for the cup?", a: "Yes. Each cup has its own rental list, and every rental is at the lowest level the cup allows, so any 6 work and any 3 stay under the cup's level limit." },
      { q: "What about Mew?", a: "Mew (and Celebi and Surfing Pikachu in Stadium 2) only unlock in Prime Cup Round 2. Switch on Round 2 rentals to include them." },
    ],
  },
};

/** Exact-match anchors for cross-links, in display order. */
export const RANDOMIZER_LINKS: { slug: string; label: string; href: string }[] = [
  { slug: "mario-kart-8-deluxe", label: "Mario Kart 8 Deluxe Randomizer", href: "/randomizers/mario-kart-8-deluxe" },
  { slug: "mario-kart-world", label: "Mario Kart World Randomizer", href: "/randomizers/mario-kart-world" },
  { slug: "super-mario-party-jamboree", label: "Mario Party Jamboree Randomizer", href: "/randomizers/super-mario-party-jamboree" },
  { slug: "mario-party-superstars", label: "Mario Party Superstars Randomizer", href: "/randomizers/mario-party-superstars" },
  { slug: "super-smash-bros-ultimate", label: "Smash Ultimate Randomizer", href: "/randomizers/super-smash-bros-ultimate" },
  { slug: "splatoon-3", label: "Splatoon 3 Randomizer", href: "/randomizers/splatoon-3" },
  { slug: "kirby-air-riders", label: "Kirby Air Riders Randomizer", href: "/randomizers/kirby-air-riders" },
  { slug: "pokemon-stadium", label: "Pokémon Stadium Randomizer", href: "/randomizers/pokemon-stadium" },
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
    alternates: { canonical },
  };
}
