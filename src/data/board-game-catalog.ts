/**
 * Starter board-game catalog — a curated set of popular titles that seeds the
 * "games I'm bringing" suggestions. It works everywhere, including production
 * where live BoardGameGeek lookups are blocked and the BGG cache starts empty.
 * Names + a rough length bucket only; cover art / player counts come from BGG
 * enrichment when available. Free text is still allowed, so this is additive.
 */

import type { NightLength } from "@/lib/board-game-nights/types";

export interface StarterGame {
  name: string;
  length: NightLength;
}

export const STARTER_BOARD_GAMES: StarterGame[] = [
  // Gateway / modern hits
  { name: "Catan", length: "long" },
  { name: "Ticket to Ride", length: "moderate" },
  { name: "Carcassonne", length: "moderate" },
  { name: "Wingspan", length: "long" },
  { name: "Azul", length: "moderate" },
  { name: "Splendor", length: "moderate" },
  { name: "7 Wonders", length: "moderate" },
  { name: "Pandemic", length: "moderate" },
  { name: "Dominion", length: "moderate" },
  { name: "Cascadia", length: "moderate" },
  { name: "King of Tokyo", length: "moderate" },
  { name: "Dixit", length: "moderate" },
  // Party / social
  { name: "Codenames", length: "moderate" },
  { name: "Just One", length: "quick" },
  { name: "Wavelength", length: "moderate" },
  { name: "Telestrations", length: "moderate" },
  { name: "The Resistance: Avalon", length: "moderate" },
  { name: "Coup", length: "quick" },
  { name: "Skull", length: "quick" },
  { name: "Cards Against Humanity", length: "moderate" },
  { name: "Apples to Apples", length: "moderate" },
  // Quick / card / filler
  { name: "Sushi Go!", length: "quick" },
  { name: "Love Letter", length: "quick" },
  { name: "Exploding Kittens", length: "quick" },
  { name: "Uno", length: "quick" },
  { name: "Bananagrams", length: "quick" },
  // Heavier / strategy
  { name: "Terraforming Mars", length: "long" },
  { name: "Scythe", length: "long" },
  { name: "Root", length: "long" },
  { name: "Betrayal at House on the Hill", length: "long" },
  { name: "Gloomhaven", length: "long" },
  // Classics
  { name: "Yahtzee", length: "moderate" },
  { name: "Scrabble", length: "long" },
  { name: "Clue", length: "moderate" },
  { name: "Risk", length: "long" },
  { name: "Monopoly", length: "long" },
  { name: "Trivial Pursuit", length: "long" },
  { name: "Chess", length: "moderate" },
  { name: "Blokus", length: "moderate" },
  { name: "Qwirkle", length: "moderate" },
  { name: "Connect 4", length: "quick" },
];

/** Case-insensitive name search over the starter catalog. */
export function searchStarterGames(query: string, limit = 8): StarterGame[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const starts: StarterGame[] = [];
  const contains: StarterGame[] = [];
  for (const g of STARTER_BOARD_GAMES) {
    const n = g.name.toLowerCase();
    if (n.startsWith(q)) starts.push(g);
    else if (n.includes(q)) contains.push(g);
  }
  return [...starts, ...contains].slice(0, limit);
}
