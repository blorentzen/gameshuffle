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

import { CONFIG_LIMITS, TOURNAMENT_LIMITS, DISCORD_SERVER_LIMITS } from "@/lib/subscription";

export interface Highlight {
  label: string;
  detail: string;
}

export interface HighlightGroup {
  group: string;
  items: Highlight[];
}

/** Grouped by where the value shows up, not by which subsystem ships it. */
export const PRO_HIGHLIGHTS: HighlightGroup[] = [
  {
    group: "On stream",
    items: [
      { label: "OBS overlay", detail: "Combos, wheels, polls and events render straight into your scene as a browser source." },
      { label: "Channel point rewards", detail: "Viewers spend points to reroll your build. The reward is created and refunded for you." },
      { label: "Wheels", detail: "Build wheels in the hub, spin from chat or the dashboard, and the overlay announces the winner." },
      { label: "Walk-up anthems", detail: "A short track plays when a regular shows up in chat. You set who qualifies." },
    ],
  },
  {
    group: "For your chat",
    items: [
      { label: "Chat commands", detail: "!gs-join, !gs-shuffle, !spin, !poll and the rest, with per-command cooldowns you control." },
      { label: "Token economy", detail: "A closed-loop currency your viewers earn and spend. Never bought, never cashed out." },
      { label: "Prediction markets", detail: "Open a market on the next race, take bets in tokens, and pay out on the result." },
      { label: "Live polls", detail: "One poll across Twitch, Discord, your live page and the overlay, with a single tally." },
      { label: "Picks and bans", detail: "Let chat vote tracks and items in or out before a race, with rate limiting handled." },
    ],
  },
  {
    group: "For your account",
    items: [
      { label: "Discord bot", detail: "Announcements, routing, roles and AutoMod, plus slash commands in your server." },
      { label: "Your live page", detail: "A public /live page viewers land on: participants, markets, events and polls in one view." },
      { label: "No limits", detail: "Unlimited saved setups and active tournaments instead of the free tier's caps." },
      { label: "Ranked TCG Companion", detail: "Ranked online play, full cosmetics, replays and tournament integration." },
    ],
  },
];

export const CIRCUIT_HIGHLIGHTS: HighlightGroup[] = [
  {
    group: "Running the event",
    items: [
      { label: "Multi-lobby fields", detail: "Go past a single game lobby: 64 or 256 players across as many lobbies as it takes." },
      { label: "Championship series", detail: "A season of events with carry-over standings and season points computed for you." },
      { label: "Co-organizers", detail: "Share the manage page so you are not the only person who can run the bracket." },
      { label: "Custom seeding and redraw", detail: "Seed the field yourself, or redraw a round when someone no-shows." },
    ],
  },
  {
    group: "The public side",
    items: [
      { label: "Custom page branding", detail: "Your colors and banner on the tournament page entrants actually see." },
      { label: "Live randomized rounds", detail: "Reveal each round's tracks live to everyone at once. Setup is free; going live is paid." },
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
  { label: "Active tournaments", free: cap(TOURNAMENT_LIMITS.free), pro: cap(TOURNAMENT_LIMITS.pro) },
  { label: "Discord servers", free: cap(DISCORD_SERVER_LIMITS.free), pro: cap(DISCORD_SERVER_LIMITS.pro) },
  { label: "Twitch integration", free: "Not included", pro: "Included" },
  { label: "OBS overlay", free: "Not included", pro: "Included" },
];

/** Platform fee in basis points rendered the way an organizer reads it. */
export function feeLabel(fee: { bps: number; fixedCents: number } | undefined): string {
  if (!fee) return "—";
  if (fee.bps === 0 && fee.fixedCents === 0) return "No platform fee";
  const pct = fee.bps / 100;
  const flat = fee.fixedCents ? ` + ${fee.fixedCents}¢` : "";
  return `${pct % 1 === 0 ? pct : pct.toFixed(2)}%${flat} per ticket`;
}
