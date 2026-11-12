/**
 * What each plan actually gets you, written for someone deciding whether to pay.
 *
 * The Plans tab used to show six bare labels ("Picks & bans modules") with no
 * explanation, which reads as a checklist rather than a reason. Every highlight
 * here carries a `detail` line: what the thing does, in the words a streamer or
 * organizer would use.
 *
 * Kept separate from `subscription.ts` on purpose. That file is the ENFORCEMENT
 * model — capability strings and numeric limits the server gates on. This file
 * is the SALES model, and the two answer different questions. The numbers below
 * are the only overlap, and they import from the enforcement side so a limit
 * change cannot leave the pitch quoting a stale figure.
 */

import { CONFIG_LIMITS, TOURNAMENT_LIMITS } from "@/lib/subscription";

export interface Highlight {
  label: string;
  detail: string;
}

export interface HighlightGroup {
  group: string;
  items: Highlight[];
}

/** What every account gets without paying: shown to free accounts so they know what they already have. */
export const FREE_HIGHLIGHTS: HighlightGroup[] = [
  {
    group: "Play",
    items: [
      { label: "Every randomizer", detail: "Mario Kart, Smash, Mario Party, Splatoon, Kirby Air Riders, Overwatch, Marvel Rivals, GoldenEye, Pokémon and more, each with its own art." },
      { label: "The Daily and the Weekly", detail: "A new character to guess every day and a challenge for everyone every week, with streaks on your profile." },
      { label: "Game night tools", detail: "Live nights on everyone's phones and the TV, the GameShuffle Originals, the tier list maker, wheel, dice and more." },
    ],
  },
  {
    group: "Organize",
    items: [
      { label: "Tournaments", detail: "Brackets, Heat → Mains, live updates for your entrants, and random-character rounds rolled for every game we have. Revealing rounds live to everyone is GS Circuit." },
      { label: "AI to try", detail: "Plain-language randomizer setup, the night planner and the tournament helper, a few times a day." },
      { label: "TCG Companion and My Cards", detail: "Counters, coin and dice for Pokémon TCG, plus your collection." },
    ],
  },
];

/** Grouped by where the value shows up, not by which subsystem ships it. */
export const PRO_HIGHLIGHTS: HighlightGroup[] = [
  {
    group: "On stream",
    items: [
      { label: "The GameShuffle overlay", detail: "Rolls, wheels, polls, bingo, drafts, raffles, timers and tier lists in your scene as one browser source. The MMR card, war, speedrun and timer overlays are free on their own." },
      { label: "Chat rolls for every game", detail: "!gs-shuffle gives each viewer a pick from the game you're streaming, with official art on the overlay." },
      { label: "Match rolls and viewer battles", detail: "!gs setup rolls the tracks, stage, board or map; !gs battle rolls the whole lobby at once." },
      { label: "Channel point rewards", detail: "Viewers spend points to reroll your pick. The reward is created and refunded for you." },
      { label: "Wheels", detail: "Build wheels, spin from chat or the dashboard, and the overlay announces the winner." },
    ],
  },
  {
    group: "Games with your chat",
    items: [
      { label: "Live polls", detail: "One poll across Twitch, Discord, your live page and the overlay, with a single tally." },
      { label: "Stream Bingo", detail: "Viewers grab a card on your live page; claims are checked and winners paid in tokens." },
      { label: "Chat Draft", detail: "Chat drafts your team one pick at a time, or captains pick players into teams." },
      { label: "Who Said It? and Chat Brain", detail: "Guess the quote, and ask chat your own survey questions." },
      { label: "Trivia and live nights on stream", detail: "Chat answers your trivia night with !a and viewers play on your live page; on a live night, chat votes who gets the next Chance card." },
      { label: "Level queue", detail: "Viewers send Mario Maker 2, Fortnite and Fall Guys levels with !add, and you play them in order." },
      { label: "Speedrun predictions and pace alerts", detail: "Chat calls whether this run is a PB, and your Discord hears when you're on PB pace." },
      { label: "Your war on the overlay", detail: "A clan war's score on the GameShuffle overlay beside your other pieces." },
      { label: "Token economy and predictions", detail: "A closed-loop currency viewers earn and spend on markets, bounties and awards. Never bought, never cashed out." },
    ],
  },
  {
    group: "AI tools",
    items: [
      { label: "Make it with AI", detail: "Wheel slices, bingo squares, tier lists and party game packs from a theme you type." },
      { label: "Recaps", detail: "A Discord post and a short post written from what happened on your stream or night." },
      { label: "A monthly allowance", detail: "Every AI tool draws from one allowance that refills over 30 days." },
    ],
  },
  {
    group: "For your account",
    items: [
      { label: "Discord bot", detail: "Up to 5 servers, each with its own announcements, routing, roles and AutoMod, plus slash commands." },
      { label: "Your live page", detail: "A public /live page viewers land on: the lobby, polls, bingo, drafts and markets in one view." },
      { label: "No limits", detail: "Unlimited saved setups and active tournaments instead of the free tier's caps." },
      { label: "Game nights that update live", detail: "Your game night's attendee list updates as people RSVP, and its TV board keeps itself in sync." },
      { label: "Play together in the TCG Companion", detail: "Host one Pokémon TCG board on two phones, at the table or on a call. Your opponent joins free." },
    ],
  },
];

export const CIRCUIT_HIGHLIGHTS: HighlightGroup[] = [
  {
    group: "Running the event",
    items: [
      { label: "Multi-lobby fields", detail: "Go past a single game lobby: 64 or 256 players across as many lobbies as it takes." },
      { label: "Championship series", detail: "A season of Heat → Mains events with carry-over standings and season points computed for you." },
      { label: "Unlimited active tournaments", detail: "Run as many tournaments at once as you like. Free accounts keep one going at a time." },
      { label: "Co-organizers", detail: "Share the manage page so you are not the only person who can run the bracket." },
      { label: "Custom seeding and redraw", detail: "Seed the field yourself, or redraw a round when someone no-shows." },
    ],
  },
  {
    group: "Keeping entrants in the loop",
    items: [
      { label: "Text reminders", detail: "Check-in and start-time texts to entrants who opt in, with a monthly text allowance on each tier (US numbers)." },
      { label: "Live randomized rounds", detail: "Reveal each round's tracks or picks live to everyone at once. Setup is free; going live is paid." },
      { label: "Custom page branding", detail: "Your colors and banner on the tournament page entrants actually see." },
      { label: "Ticket sales analytics", detail: "Sales over time, per-tier breakdown and payout status for every paid event." },
    ],
  },
];

/**
 * The caps someone on Free is actually living with. Sourced from the limit
 * constants so the table cannot drift from what the server enforces.
 */
export interface LimitRow {
  label: string;
  free: string;
  pro: string;
}

const cap = (n: number): string => (n === Infinity ? "Unlimited" : n === 0 ? "Not included" : String(n));

export const FREE_VS_PRO: LimitRow[] = [
  { label: "Saved setups", free: cap(CONFIG_LIMITS.free), pro: cap(CONFIG_LIMITS.pro) },
  { label: "Active tournaments", free: cap(TOURNAMENT_LIMITS.free), pro: `${cap(TOURNAMENT_LIMITS.pro)} (GS Circuit too)` },
  { label: "Twitch integration", free: "Not included", pro: "Included" },
  { label: "MMR card, war, speedrun and timer overlays", free: "Included", pro: "Included" },
  { label: "The GameShuffle overlay (every tool in one source)", free: "Not included", pro: "Included" },
];

/** Platform fee in basis points rendered the way an organizer reads it. */
export function feeLabel(fee: { bps: number; fixedCents: number } | undefined): string {
  if (!fee) return "—";
  if (fee.bps === 0 && fee.fixedCents === 0) return "No platform fee";
  const pct = fee.bps / 100;
  const flat = fee.fixedCents ? ` + ${fee.fixedCents}¢` : "";
  return `${pct % 1 === 0 ? pct : pct.toFixed(2)}%${flat} per ticket`;
}
