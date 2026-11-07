import { compAppLive } from "@/lib/discord/appIds";
import type { Interest } from "@/lib/interests/rules";
import { DAILY_DEX_PUBLIC, DUEL_PUBLIC, FIRE_ROUND_PUBLIC, ROAD_PUBLIC, N64_PARTY_PUBLIC, FRLG_PUBLIC, GOLDENEYE_PUBLIC, GUIDES_PUBLIC, KIRBY_PUBLIC, STADIUM_PUBLIC, SMASH_PUBLIC, SPLATOON_PUBLIC, MK64_PUBLIC, PERFECT_DARK_PUBLIC, OVERWATCH_PUBLIC, MARVEL_RIVALS_PUBLIC } from "@/lib/games-visibility";
/**
 * The five worlds: the single source of truth for GameShuffle's information architecture (menus and account picks
 * 2026-11-05, https://claude.ai/artifact/FVgHcSgixdcLaGZisgsd97, 1A): Play, Pokémon, Compete, Host, Stream. The same
 * for everyone, so anything is one tap away; the phone menu puts the account's interests first and open
 * (`PILLAR_INTERESTS`), the desktop menu keeps one order. Community (profiles, crews, messages) lives in the account
 * menu and the footer.
 *
 * Nav, footer, homepage and the sitemap all read from here, so they can't disagree. The organising question is "what
 * do I want to do today": Play (something now), Pokémon (its own world of games and cards), Compete (enter or follow
 * something competitive), Host (run a night or an event for other people), Stream (put it on screen). Stream is a
 * role more than an activity, so its account tools appear once someone streams.
 */

export type PillarId = "play" | "pokemon" | "compete" | "host" | "stream";

/** Who a destination is for. `member` = any signed-in account. `shop` = everyone, once visitors can see the shop. */
export type NavAudience = "everyone" | "member" | "streamer" | "staff" | "shop";

export interface NavDestination {
  label: string;
  href: string;
  /** One line for the homepage and pillar landings. Skipped in dense menus. */
  blurb?: string;
  audience?: NavAudience;
  /** Behind a paid plan. Shown locked rather than hidden — see `disclosure`. */
  paid?: "pro" | "circuit";
  /** Keep out of the primary nav; still reachable from the pillar page/footer. */
  secondary?: boolean;
  /** List in the footer even when `secondary` keeps it out of the nav menus. */
  footer?: boolean;
  /** Keep out of the footer: it's already listed under another world there (the dailies in Play and Pokémon). */
  noFooter?: boolean;
  /** Keep out of the sitemap: a page that asks visitors to sign in first (create pages). */
  noIndex?: boolean;
}

export interface NavGroup {
  heading: string;
  items: NavDestination[];
}

export interface Pillar {
  id: PillarId;
  /** The verb a person would use about themselves. */
  label: string;
  /** Answers "what do I want to do today" in one line. */
  intent: string;
  /** The pillar's own landing page. */
  href: string;
  groups: NavGroup[];
  /** The paid product that extends this pillar, if any. */
  upgrade?: { label: string; href: string; blurb: string };
}

/**
 * Disclosure rule, applied everywhere nav is rendered:
 *   - Gate by ROLE. If someone can never do it, hide it — a participant should
 *     not see an organizer's Manage surface.
 *   - Disclose by TIER. If they could do it by paying, show it locked. That is
 *     how paid stays visible without becoming its own nav bucket.
 */
export function isVisible(
  d: NavDestination,
  ctx: { signedIn: boolean; isStreamer: boolean; isStaff: boolean; shop?: boolean },
): boolean {
  switch (d.audience) {
    case "shop": return !!ctx.shop;
    case "member": return ctx.signedIn;
    case "streamer": return ctx.isStreamer;
    case "staff": return ctx.isStaff;
    default: return true;
  }
}

/** Which worlds an interest opens first on phones (src/lib/interests/rules.ts). */
export const PILLAR_INTERESTS: Record<PillarId, Interest[]> = {
  play: ["daily"],
  pokemon: ["pokemon"],
  compete: ["competitive"],
  host: ["home", "events"],
  stream: ["stream"],
};

/** The holiday page, in its season only (Pacific days): Halloween in October, Christmas from Nov 15. */
function seasonal(): NavDestination[] {
  const md = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }).slice(5);
  if (md >= "10-01" && md <= "10-31") return [{ label: "Halloween party games", href: "/game-nights/halloween-party-games", blurb: "Eight free games for a Halloween party." }];
  if (md >= "11-15" && md <= "12-31") return [{ label: "Christmas party games", href: "/game-nights/christmas-party-games", blurb: "Eight free games for a Christmas party." }];
  return [];
}

export const PILLARS: Pillar[] = [
  {
    id: "play",
    label: "Play",
    intent: "Something to play right now, on your own or with the people in the room.",
    href: "/apps",
    groups: [
      {
        heading: "Daily games",
        items: [
          { label: "Daily Shuffle", href: "/daily", blurb: "Guess today's character." },
          ...(DAILY_DEX_PUBLIC ? [{ label: "Daily Dex", href: "/daily-dex", blurb: "Guess today's Pokémon." }] : []),
          ...(FIRE_ROUND_PUBLIC ? [{ label: "Fire Round", href: "/daily-trivia", blurb: "Daily trivia against the clock." }] : []),
          ...(DUEL_PUBLIC ? [{ label: "Daily Duel", href: "/daily-duel", blurb: "Today's trainer, one card battle." }] : []),
          { label: "Weekly Challenge", href: "/weekly", blurb: "One question for everyone, answers on Monday." },
        ],
      },
      {
        heading: "Randomizers",
        items: [
          { label: "Mario Kart 8 Deluxe randomizer", href: "/randomizers/mario-kart-8-deluxe", blurb: "Random characters, karts and tracks for a night of MK8DX." },
          { label: "Mario Kart World randomizer", href: "/randomizers/mario-kart-world", blurb: "Combos, tracks and knockout rallies for MK World.", noFooter: true },
          ...(SMASH_PUBLIC ? [{ label: "Super Smash Bros. Ultimate randomizer", href: "/randomizers/super-smash-bros-ultimate", blurb: "Fighters, stages, rules and Squad Strike for up to 8 players.", noFooter: true }] : []),
          { label: "Mario Party Jamboree randomizer", href: "/randomizers/super-mario-party-jamboree", blurb: "Boards, characters, minigames and house rules for party night.", noFooter: true },
          // The games people look for most; every other randomizer lives on /randomizers so the menu (and the phone
          // menu) stays short. The rest stay here as `secondary` for the sitemap and anything that enumerates them.
          { label: "All randomizers", href: "/randomizers", blurb: "Every game we roll for: Splatoon, Overwatch, Kirby and more." },
          { label: "Mario Party Superstars randomizer", href: "/randomizers/mario-party-superstars", blurb: "The five classic boards, 100 minigames and house rules.", secondary: true },
          ...(MARVEL_RIVALS_PUBLIC ? [{ label: "Marvel Rivals randomizer", href: "/randomizers/marvel-rivals", blurb: "Hero roulette, Team-Up teams and a random map.", secondary: true }] : []),
          ...(KIRBY_PUBLIC ? [{ label: "Kirby Air Riders randomizer", href: "/randomizers/kirby-air-riders", blurb: "Riders, machines, courses and City Trial Stadiums for up to 8 players.", secondary: true }] : []),
          ...(N64_PARTY_PUBLIC ? [
            { label: "Mario Party randomizer", href: "/randomizers/mario-party", blurb: "The N64 original: 8 boards and 50 minigames.", secondary: true },
            { label: "Mario Party 2 randomizer", href: "/randomizers/mario-party-2", blurb: "Six lands and 65 minigames.", secondary: true },
            { label: "Mario Party 3 randomizer", href: "/randomizers/mario-party-3", blurb: "Battle Royale boards and 71 minigames.", secondary: true },
          ] : []),
          ...(GOLDENEYE_PUBLIC ? [{ label: "GoldenEye 007 randomizer", href: "/randomizers/goldeneye-007", blurb: "Scenario, map, weapons and characters for 2 to 4 players.", secondary: true }] : []),
          ...(MK64_PUBLIC ? [{ label: "Mario Kart 64 randomizer", href: "/randomizers/mario-kart-64", blurb: "A different character for up to 4, tracks and battle courses.", secondary: true }] : []),
          ...(PERFECT_DARK_PUBLIC ? [{ label: "Perfect Dark randomizer", href: "/randomizers/perfect-dark", blurb: "Scenario, arena, weapons and simulants for a Combat Simulator match.", secondary: true }] : []),
          ...(OVERWATCH_PUBLIC ? [{ label: "Overwatch hero randomizer", href: "/randomizers/overwatch", blurb: "Hero roulette with role queue, no repeats and a random map.", secondary: true }] : []),
          ...(SPLATOON_PUBLIC ? [{ label: "Splatoon 3 randomizer", href: "/randomizers/splatoon-3", blurb: "Weapon kits, battles, Salmon Run stages and teams for up to 8 players.", secondary: true }] : []),
        ],
      },
      {
        heading: "Party and tools",
        items: [
          { label: "Party games on phones", href: "/game-nights/tools", blurb: "Odd One Out, Most Likely To and Tier Wars, with the TV showing the reveal." },
          // One door to the tools rather than ten rows of them.
          { label: "Free tools", href: "/tools", blurb: "Wheel spinner, dice, tier lists, bingo and more." },
          { label: "Everything on GameShuffle", href: "/apps", blurb: "Every game and tool in one place." },
        ],
      },
      {
        // Kept here so the sitemap and any tools index can enumerate them; every one is `secondary`, so none reaches
        // the nav or footer.
        heading: "Every free tool",
        items: [
          { label: "Wheel spinner", href: "/wheel-spinner", secondary: true },
          { label: "Dice roller", href: "/dice-roller", secondary: true },
          { label: "Coin flip", href: "/coin-flip", secondary: true },
          { label: "Name picker", href: "/name-picker", secondary: true },
          { label: "Tier list maker", href: "/tier-list-maker", secondary: true },
          { label: "Bingo generator", href: "/bingo-card-generator", secondary: true },
          { label: "Magic 8-ball", href: "/magic-8-ball", secondary: true },
          { label: "Stream timer", href: "/stream-timer", secondary: true },
          { label: "Truth or dare", href: "/truth-or-dare", secondary: true },
          { label: "Yes / no", href: "/yes-no", secondary: true },
        ],
      },
    ],
  },
  {
    id: "pokemon",
    label: "Pokémon",
    intent: "Pokémon games to play every day, and everything for the card game.",
    href: "/pokemon-tcg",
    groups: [
      {
        heading: "Games",
        items: [
          ...(DAILY_DEX_PUBLIC ? [{ label: "Daily Dex", href: "/daily-dex", blurb: "Guess today's Pokémon.", noFooter: true }] : []),
          ...(DUEL_PUBLIC ? [{ label: "Daily Duel", href: "/daily-duel", blurb: "Today's trainer, one card battle.", noFooter: true }] : []),
          ...(ROAD_PUBLIC ? [{ label: "Trainer Road", href: "/pokemon-trainers", blurb: "Duel every Gym Leader, Elite Four member and Champion, any time." }] : []),
          { label: "Name every Pokémon", href: "/name-every-pokemon", blurb: "All 1,025 or one generation, against the clock." },
          { label: "Random Pokémon generator", href: "/randomizers/pokemon", blurb: "One, three or six Pokémon, by generation and type." },
          ...(FRLG_PUBLIC ? [{ label: "Fire Red & Leaf Green run challenge", href: "/randomizers/pokemon-firered-leafgreen", blurb: "A random starter, catches to make before every gym, level caps.", footer: true, secondary: true }] : []),
          ...(STADIUM_PUBLIC ? [{ label: "Pokémon Stadium randomizer", href: "/randomizers/pokemon-stadium", blurb: "Random rental teams for every Stadium and Stadium 2 cup.", secondary: true }] : []),
        ],
      },
      {
        heading: "The card game",
        items: [
          { label: "Pokémon TCG", href: "/pokemon-tcg", blurb: "Deck guides, singles and the free companion for the card game." },
          { label: "TCG Companion", href: "/pokemon-tcg-companion", blurb: "Damage, conditions, prizes and coin flips at the table." },
          { label: "Deck guides", href: "/pokemon-tcg/decks", blurb: "Standard deck lists and guides, from beginner to competitive." },
          { label: "Rules", href: "/pokemon-tcg/rules", blurb: "Damage counters, Special Conditions, Prize cards and a turn, in plain words." },
          { label: "Checklists", href: "/pokemon-tcg/checklists", blurb: "Tick off the cards you have, set by set.", secondary: true, footer: true },
          { label: "Open the Companion", href: "/tcg-companion", secondary: true },
          { label: "My Cards", href: "/account/pokemon?tab=my-cards", blurb: "Track the cards you own.", audience: "member" },
          { label: "Your deck lists", href: "/account/pokemon?tab=tcg-decks", blurb: "Check a list, see what you own.", audience: "member" },
        ],
      },
    ],
  },
  {
    id: "compete",
    label: "Compete",
    intent: "Enter something, follow the boards, or chase a better time.",
    href: "/competitive-mario-kart",
    groups: [
      {
        // Competitive Mario Kart picks 2026-10-30 (8A): the hub first, then its tools.
        heading: "Mario Kart",
        items: [
          { label: "Competitive Mario Kart", href: "/competitive-mario-kart", blurb: "Lounge stats, time trials, the MMR card and tournaments in one place.", footer: true },
          { label: "Time trials", href: "/time-trials", blurb: "Every track's best times in Mario Kart 8 Deluxe and World. Add yours from a screenshot.", footer: true },
          { label: "Lounge stats", href: "/lounge", blurb: "Any lounge player's season, plus boards for the people you know.", footer: true },
          { label: "MMR card", href: "/mmr-card", blurb: "Your lounge MMR on stream, live, with a moment every event. Free.", footer: true },
          // GameShuffle Competitive's page, once the app exists here (picks 2026-10-31, 5A).
          ...(compAppLive() ? [{ label: "Mario Kart Discord bot", href: "/mario-kart-discord-bot", blurb: "Time trials, MMR and room reads in your server. Free.", footer: true }] : []),
          { label: "Live scoring", href: "/competitive/mario-kart-8-deluxe", blurb: "Score a set between friends as you race." },
        ],
      },
      {
        heading: "Tournaments",
        items: [
          { label: "Browse tournaments", href: "/tournament", blurb: "Open registration, live brackets and past results." },
          { label: "Your tournaments", href: "/account/events?tab=tournaments", blurb: "The ones you run and the ones you entered.", audience: "member" },
          { label: "Bracket generator", href: "/bracket-generator", blurb: "Make a bracket, round robin or Swiss rounds in a minute. No account." },
          { label: "Round robin generator", href: "/round-robin-generator", secondary: true },
          { label: "Swiss pairing generator", href: "/swiss-pairing-generator", secondary: true },
          ...(GUIDES_PUBLIC ? [{ label: "Guides", href: "/guides", blurb: "Formats, seeding, group sizes and the logistics nobody writes down." }] : []),
        ],
      },
    ],
  },
  {
    id: "host",
    label: "Host",
    intent: "Run a night at home, or an event for a group.",
    href: "/game-nights",
    groups: [
      {
        heading: "At home",
        items: [
          { label: "Game night tools", href: "/game-nights/tools", blurb: "Party games on phones, a night planner, score pads and pickers." },
          { label: "Night planner", href: "/game-nights/tools/night-planner", blurb: "A lineup for tonight from the games you own." },
          { label: "Trivia nights", href: "/trivia", blurb: "Teams answer on their phones, questions on the TV." },
          ...seasonal(),
        ],
      },
      {
        heading: "For a group",
        items: [
          { label: "Game nights near you", href: "/game-nights", blurb: "Board, video and TCG nights near you or online." },
          { label: "Host a game night", href: "/game-nights/create", blurb: "Public or invite only, with RSVPs and reminders.", noIndex: true },
          { label: "Run a tournament", href: "/tournament/create", blurb: "Brackets, Swiss, points or the Heat to Mains ladder.", noIndex: true },
          { label: "How hosting works", href: "/host-a-tournament", blurb: "Formats, live scoring, guests and seasons, in one place." },
          { label: "Trivia leagues", href: "/trivia/leagues/new", blurb: "A weekly league with standings and a champion.", noIndex: true },
          { label: "Try the sandbox", href: "/tournament/sandbox", blurb: "Play with every format without an account.", secondary: true },
          { label: "For organizers", href: "/for-organizers", secondary: true },
        ],
      },
    ],
    upgrade: {
      label: "GameShuffle Circuit",
      href: "/gs-circuit",
      blurb: "Bigger fields, championship series, co-organizers and lower ticket fees.",
    },
  },
  {
    id: "stream",
    label: "Stream",
    intent: "Put what you are already doing on screen, and bring chat into it.",
    href: "/gs-pro",
    groups: [
      {
        heading: "Your channel",
        items: [
          { label: "Studio", href: "/hub", blurb: "Your streams, tools and setup in one place.", audience: "streamer" },
          { label: "Stream settings", href: "/account/streaming", blurb: "Setup, overlay, chat and live games.", audience: "streamer" },
        ],
      },
      {
        heading: "Getting started",
        items: [
          { label: "What GS Pro does", href: "/gs-pro", blurb: "Overlay, chat commands, wheels, polls and the token economy." },
          { label: "Twitch chat games", href: "/twitch-chat-games", blurb: "Twelve games your chat can play, and how to start each one." },
          { label: "GameShuffle for Discord", href: "/discord", blurb: "The bot, the dailies and Chat Brain in your server." },
          { label: "For new streamers", href: "/for-streamers/aspiring" },
          { label: "For current streamers", href: "/for-streamers/current" },
          { label: "Streamer beta", href: "/beta", secondary: true },
        ],
      },
    ],
    upgrade: {
      label: "GameShuffle Pro",
      href: "/gs-pro",
      blurb: "The overlay, chat commands, channel points and the token economy.",
    },
  },
];

/** The worlds in the order this person's phone menu shows them: their interests' first, then the rest. */
export function pillarsFor(interests: Interest[]): { pillar: Pillar; mine: boolean }[] {
  const mine = PILLARS.filter((p) => PILLAR_INTERESTS[p.id].some((i) => interests.includes(i)));
  return [...mine.map((pillar) => ({ pillar, mine: true })), ...PILLARS.filter((p) => !mine.includes(p)).map((pillar) => ({ pillar, mine: false }))];
}

/** Community left the menus (2026-11-05): the footer has its column and the account menu its links. */
export const COMMUNITY_LINKS: NavDestination[] = [
  { label: "Communities", href: "/communities", blurb: "Every community on GameShuffle." },
  { label: "Find players", href: "/players", blurb: "People who play what you play." },
  { label: "Your feed", href: "/comms", blurb: "Alerts and messages.", audience: "member" },
  // Pick 13: menus say Merch (the address stays /shop); hidden until visitors can see the shop.
  { label: "Merch", href: "/shop", blurb: "Tees, hoodies, hats and phone cases, made when you order.", audience: "shop" },
];

export const pillar = (id: PillarId): Pillar => PILLARS.find((p) => p.id === id)!;

/** Primary nav items for a pillar — `secondary` entries live on the pillar page. */
export function primaryItems(
  p: Pillar,
  ctx: { signedIn: boolean; isStreamer: boolean; isStaff: boolean; shop?: boolean },
): NavGroup[] {
  return p.groups
    .map((g) => ({ heading: g.heading, items: g.items.filter((i) => !i.secondary && isVisible(i, ctx)) }))
    .filter((g) => g.items.length > 0);
}

/**
 * Footer columns. Same pillars, plus the two columns that are not activities —
 * a footer is also where people look for the company and the legal pages, and
 * pretending those are "things to do" would be worse than admitting they differ.
 */
export const FOOTER_EXTRA: NavGroup[] = [
  { heading: "Community", items: COMMUNITY_LINKS },
  {
    heading: "Company",
    items: [
      // One entry, not two: /features redirects here, and listing the same
      // page twice under different labels reads as two destinations.
      { label: "New here? Start here", href: "/welcome" },
      { label: "Pricing & features", href: "/gs-pro" },
      { label: "Help", href: "/help" },
      { label: "Idea board", href: "/ideas" },
      { label: "Support GameShuffle", href: "/support" },
      { label: "Credits", href: "/credits" },
      { label: "Contact", href: "/contact-us" },
    ],
  },
  {
    heading: "Legal",
    items: [
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
      { label: "Cookies", href: "/cookie-policy" },
      { label: "Accessibility", href: "/accessibility" },
      { label: "Text messages", href: "/sms" },
      { label: "Data request", href: "/data-request" },
    ],
  },
];

/**
 * Every publicly indexable destination in the IA, for the sitemap.
 *
 * `secondary` is about CHROME, not indexing — a free tool is kept out of the
 * nav because ten of them is a menu nobody reads, but each one is a real page
 * that should rank. What is excluded is anything behind a sign-in: an
 * `audience` other than "everyone" means the crawler would only ever see a
 * redirect.
 *
 * Query strings are stripped: `?tab=` selects a view, it is not a distinct URL.
 */
export function publicDestinations(): string[] {
  const out = new Set<string>();
  for (const p of PILLARS) {
    out.add(p.href.split("?")[0]);
    for (const g of p.groups) {
      for (const i of g.items) {
        if ((i.audience && i.audience !== "everyone") || i.noIndex) continue;
        out.add(i.href.split("?")[0]);
      }
    }
    if (p.upgrade) out.add(p.upgrade.href.split("?")[0]);
  }
  for (const g of FOOTER_EXTRA) {
    for (const i of g.items) out.add(i.href.split("?")[0]);
  }
  return [...out].filter((h) => h.startsWith("/")).sort();
}
