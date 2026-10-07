import { N64_PARTY_PUBLIC, FRLG_PUBLIC, GOLDENEYE_PUBLIC, GUIDES_PUBLIC, KIRBY_PUBLIC, STADIUM_PUBLIC, SMASH_PUBLIC, SPLATOON_PUBLIC, MK64_PUBLIC, PERFECT_DARK_PUBLIC, OVERWATCH_PUBLIC, MARVEL_RIVALS_PUBLIC } from "@/lib/games-visibility";
/**
 * The four pillars — the single source of truth for GameShuffle's information
 * architecture.
 *
 * Nav, footer, homepage and the sitemap each used to declare their own idea of
 * how the site is organised, and they disagreed: the nav grouped into Play /
 * Stream / Organize / Community while the footer grouped into Apps / Free Tools
 * / Product / Company / Legal. One of those describes what someone wants to DO;
 * the other describes what we happen to have built. Fixing that in four places
 * by hand guarantees they drift again, so they all read from here.
 *
 * The organising question is "what do I want to do today", not "what apps are
 * there". That is why the pillar is `compete` and not `organize`: far more
 * people want to ENTER a tournament than run one, so the pillar is named for
 * the majority intent and organising is an action inside it.
 *
 * Three of the four are activities anyone can do. `stream` is different — it is
 * a ROLE, gated on having a channel, and a streamer running a tournament is in
 * Compete and Stream at once. It is best read as the broadcast layer over the
 * other three rather than a fourth silo, which is also why its nav entry is
 * de-emphasised until an account actually streams.
 */

export type PillarId = "play" | "compete" | "community" | "stream";

/** Who a destination is for. `member` = any signed-in account. */
export type NavAudience = "everyone" | "member" | "streamer" | "staff";

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
  ctx: { signedIn: boolean; isStreamer: boolean; isStaff: boolean },
): boolean {
  switch (d.audience) {
    case "member": return ctx.signedIn;
    case "streamer": return ctx.isStreamer;
    case "staff": return ctx.isStaff;
    default: return true;
  }
}

export const PILLARS: Pillar[] = [
  {
    id: "play",
    label: "Play",
    intent: "Do something right now, on your own or with people in the room.",
    href: "/apps",
    groups: [
      {
        heading: "Games",
        items: [
          { label: "Mario Kart 8 Deluxe randomizer", href: "/randomizers/mario-kart-8-deluxe", blurb: "Random characters, karts and tracks for a night of MK8DX." },
          { label: "Mario Party Jamboree randomizer", href: "/randomizers/super-mario-party-jamboree", blurb: "Boards, characters, minigames and house rules for party night." },
          ...(SMASH_PUBLIC ? [{ label: "Super Smash Bros. Ultimate randomizer", href: "/randomizers/super-smash-bros-ultimate", blurb: "Fighters, stages, rules and Squad Strike for up to 8 players." }] : []),
          ...(MARVEL_RIVALS_PUBLIC ? [{ label: "Marvel Rivals randomizer", href: "/randomizers/marvel-rivals", blurb: "Hero roulette, Team-Up teams and a random map. New." }] : []),
          // The four games people look for most; every other randomizer lives on
          // /randomizers so the menu (and the phone menu, a flat list) stays short.
          // The rest stay here as `secondary` for the sitemap and anything that
          // enumerates them.
          { label: "All randomizers", href: "/randomizers", blurb: "Every game we roll for: Mario Kart World, Splatoon, Pokémon and more." },
          { label: "Mario Kart World randomizer", href: "/randomizers/mario-kart-world", blurb: "Combos, tracks and knockout rallies for MK World.", secondary: true },
          { label: "Mario Party Superstars randomizer", href: "/randomizers/mario-party-superstars", blurb: "The five classic boards, 100 minigames and house rules.", secondary: true },
          ...(KIRBY_PUBLIC ? [{ label: "Kirby Air Riders randomizer", href: "/randomizers/kirby-air-riders", blurb: "Riders, machines, courses and City Trial Stadiums for up to 8 players. New.", secondary: true }] : []),
          ...(STADIUM_PUBLIC ? [{ label: "Pokémon Stadium randomizer", href: "/randomizers/pokemon-stadium", blurb: "Random rental teams for every Stadium and Stadium 2 cup. New.", secondary: true }] : []),
          ...(N64_PARTY_PUBLIC ? [
            { label: "Mario Party randomizer", href: "/randomizers/mario-party", blurb: "The N64 original: 8 boards and 50 minigames. New.", secondary: true },
            { label: "Mario Party 2 randomizer", href: "/randomizers/mario-party-2", blurb: "Six lands and 65 minigames. New.", secondary: true },
            { label: "Mario Party 3 randomizer", href: "/randomizers/mario-party-3", blurb: "Battle Royale boards and 71 minigames. New.", secondary: true },
          ] : []),
          ...(FRLG_PUBLIC ? [{ label: "Fire Red & Leaf Green run challenge", href: "/randomizers/pokemon-firered-leafgreen", blurb: "A random starter, catches to make before every gym, level caps. New.", secondary: true }] : []),
          ...(GOLDENEYE_PUBLIC ? [{ label: "GoldenEye 007 randomizer", href: "/randomizers/goldeneye-007", blurb: "Scenario, map, weapons and characters for 2 to 4 players. New.", secondary: true }] : []),
          ...(MK64_PUBLIC ? [{ label: "Mario Kart 64 randomizer", href: "/randomizers/mario-kart-64", blurb: "A different character for up to 4, tracks and battle courses. New.", secondary: true }] : []),
          ...(PERFECT_DARK_PUBLIC ? [{ label: "Perfect Dark randomizer", href: "/randomizers/perfect-dark", blurb: "Scenario, arena, weapons and simulants for a Combat Simulator match. New.", secondary: true }] : []),
          ...(OVERWATCH_PUBLIC ? [{ label: "Overwatch hero randomizer", href: "/randomizers/overwatch", blurb: "Hero roulette with role queue, no repeats and a random map. New.", secondary: true }] : []),
          ...(SPLATOON_PUBLIC ? [{ label: "Splatoon 3 randomizer", href: "/randomizers/splatoon-3", blurb: "Weapon kits, battles, Salmon Run stages and teams for up to 8 players. New.", secondary: true }] : []),
          { label: "TCG Companion", href: "/pokemon-tcg", blurb: "Damage, conditions, prizes and coin flips at the table." },
          { label: "Open the Companion", href: "/tcg-companion", secondary: true },
          { label: "My Cards", href: "/account/stuff?tab=my-cards", blurb: "Track the cards you own.", audience: "member" },
          // One door to the tools rather than ten rows of them. Listing every
          // tool put 11 items in a menu and 16 in a footer column, which is the
          // dumping the pillars exist to prevent — and a wheel spinner is not
          // really a product someone navigates to by name.
          { label: "Free tools", href: "/tools", blurb: "Wheel spinner, dice, tier lists, bingo and more." },
        ],
      },
      {
        // Kept here so the sitemap and any future tools index can enumerate
        // them; every one is `secondary`, so none reaches the nav or footer.
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
    id: "compete",
    label: "Compete",
    intent: "Enter something, or run something worth entering.",
    href: "/tournament",
    groups: [
      {
        heading: "Find a match",
        items: [
          { label: "Browse tournaments", href: "/tournament", blurb: "Open registration, live brackets and past results." },
          { label: "Mario Kart lounge", href: "/competitive/mario-kart-8-deluxe", blurb: "Normalised placement scoring across a session." },
        ],
      },
      {
        heading: "Run one",
        items: [
          { label: "Create a tournament", href: "/tournament/create", blurb: "Brackets, points or the Heat to Mains ladder.", audience: "member" },
          { label: "How hosting works", href: "/host-a-tournament", blurb: "Formats, live scoring, guests and seasons, in one place." },
          ...(GUIDES_PUBLIC ? [{ label: "Guides", href: "/guides", blurb: "Formats, seeding, group sizes and the logistics nobody writes down." }] : []),
          { label: "Try the sandbox", href: "/tournament/sandbox", blurb: "Play with every format without an account." },
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
    id: "community",
    label: "Community",
    intent: "Be with people: regulars, crews and the ones you have not met yet.",
    href: "/communities",
    groups: [
      {
        heading: "Places",
        items: [
          { label: "Community hub", href: "/communities", blurb: "Every community on GameShuffle." },
          { label: "Game nights", href: "/game-nights", blurb: "Board, video and TCG nights near you or online." },
        ],
      },
      {
        heading: "People",
        items: [
          { label: "Find players", href: "/players", blurb: "People who play what you play." },
          { label: "Your feed", href: "/comms", blurb: "Alerts and messages.", audience: "member" },
        ],
      },
    ],
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
          { label: "Stream hub", href: "/hub", blurb: "Sessions, modules and fan-out.", audience: "streamer" },
          { label: "Twitch integration", href: "/twitch", blurb: "Chat bot, channel points and EventSub health.", audience: "streamer" },
        ],
      },
      {
        heading: "Getting started",
        items: [
          { label: "What GS Pro does", href: "/gs-pro", blurb: "Overlay, chat commands, wheels, polls and the token economy." },
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

export const pillar = (id: PillarId): Pillar => PILLARS.find((p) => p.id === id)!;

/** Primary nav items for a pillar — `secondary` entries live on the pillar page. */
export function primaryItems(
  p: Pillar,
  ctx: { signedIn: boolean; isStreamer: boolean; isStaff: boolean },
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
  {
    heading: "Company",
    items: [
      // One entry, not two: /features redirects here, and listing the same
      // page twice under different labels reads as two destinations.
      { label: "Pricing & features", href: "/gs-pro" },
      { label: "Help", href: "/help" },
      { label: "Idea board", href: "/ideas" },
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
        if (i.audience && i.audience !== "everyone") continue;
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
