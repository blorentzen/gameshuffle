/**
 * What's included (try before paying picks, 2026-10-29, C1-C4, all as recommended): one table for /gs-pro
 * and /support, the place every "See what's included" link lands. About fifteen grouped rows, each with
 * the page it's about. A cell is true (included), false (not included) or a short phrase.
 * `supporterOff` is the Supporter cell if staff turn the support_supporter_looks switch off (it's on by
 * default): thank-yous only while it's off.
 * Keep it in step with what the code gates: hasLooks (src/lib/support/looks.ts) for looks, the GS Pro
 * checks for everything else.
 */

export type PlanId = "free" | "supporter" | "pro" | "backer";
export const PLAN_IDS: PlanId[] = ["free", "supporter", "pro", "backer"];
export type CompareCell = boolean | string;

export interface CompareRow {
  label: string;
  /** The feature's own page. */
  href?: string;
  free: CompareCell;
  supporter: CompareCell;
  /** The Supporter cell before Supporter looks are on sale (defaults to `supporter`). */
  supporterOff?: CompareCell;
  pro: CompareCell;
  backer: CompareCell;
}

export interface CompareGroup { label: string; rows: CompareRow[] }

const CARD_FREE = "Two fonts, any color, one look";
const CARD_ALL = "Every font, two colors, your picture, foil, ten looks";

export const COMPARE_GROUPS: CompareGroup[] = [
  {
    label: "Play",
    rows: [
      { label: "Every game, randomizer, daily and free tool", href: "/apps", free: true, supporter: true, pro: true, backer: true },
      { label: "MMR card, lounge pages and time trials", href: "/mmr-card", free: true, supporter: true, pro: true, backer: true },
    ],
  },
  {
    label: "Looks",
    rows: [
      { label: "MMR card looks", href: "/mmr-card", free: CARD_FREE, supporter: CARD_ALL, supporterOff: CARD_FREE, pro: CARD_ALL, backer: CARD_ALL },
      { label: "Profile and community skins, custom CSS", free: false, supporter: true, supporterOff: false, pro: true, backer: true },
      { label: "Brand themes on your profile, live page and overlay", free: "One color of your own", supporter: true, supporterOff: "One color of your own", pro: true, backer: true },
      { label: "Dice and coin looks", href: "/dice-roller", free: "Colors and finishes", supporter: "Wooden and rust dice, your picture on the coin", supporterOff: "Colors and finishes", pro: "Wooden and rust dice, your picture on the coin", backer: "Wooden and rust dice, your picture on the coin" },
    ],
  },
  {
    label: "Streaming and Discord",
    rows: [
      { label: "Twitch chat bot, !mmr and chat games", href: "/twitch-chat-games", free: false, supporter: false, pro: true, backer: true },
      { label: "Overlay tools, polls, Stream Bingo, Chat Brain, break mode", href: "/for-streamers", free: false, supporter: false, pro: true, backer: true },
      { label: "GameShuffle's Discord bot", href: "/discord", free: "One server", supporter: "One server", pro: "Five servers, roles and go-live alerts", backer: "Five servers, roles and go-live alerts" },
    ],
  },
  {
    label: "More",
    rows: [
      { label: "AI tools", free: "3 tries a day", supporter: "3 tries a day", pro: "60 a month across every tool", backer: "60 a month across every tool" },
      { label: "Lounge: how you play, tonight's goal, weekly report, night recap", href: "/lounge", free: false, supporter: false, pro: true, backer: true },
      { label: "Pokémon card collection and deck lists", href: "/pokemon-tcg-companion", free: "250 cards, 3 decks", supporter: "250 cards, 3 decks", pro: "No limit", backer: "No limit" },
    ],
  },
  {
    label: "Thank-yous",
    rows: [
      { label: "Supporter badge, a heart on the boards, the supporters wall", href: "/support", free: false, supporter: true, pro: false, backer: "Yes, and Champions top the wall and the credits" },
    ],
  },
];

/** A row's cell for a plan, with the Supporter cell following the switch. */
export function cellFor(row: CompareRow, plan: PlanId, supporterLooks: boolean): CompareCell {
  if (plan === "supporter") return supporterLooks ? row.supporter : row.supporterOff ?? row.supporter;
  return row[plan];
}
