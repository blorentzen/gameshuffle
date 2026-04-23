/**
 * Game registry for Twitch chat randomizers. Mirrors the Discord command's
 * game map but slimmed to what the chat flow needs. Keep the `slug` values
 * in sync with `twitch_game_categories.randomizer_slug` and with the Discord
 * side's game registry (`src/lib/discord/commands/randomize.ts`).
 */

import type { GameData } from "@/data/types";
import mk8dxData from "@/data/mk8dx-data.json";
import mkworldData from "@/data/mkworld-data.json";

export interface TwitchGameEntry {
  slug: string;
  title: string;
  data: GameData;
  hasWheels: boolean;
  hasGlider: boolean;
  /** Max simultaneous participants in a shuffle session. */
  lobbyCap: number;
}

export const TWITCH_GAMES: Record<string, TwitchGameEntry> = {
  "mario-kart-8-deluxe": {
    slug: "mario-kart-8-deluxe",
    title: "Mario Kart 8 Deluxe",
    data: mk8dxData as unknown as GameData,
    hasWheels: true,
    hasGlider: true,
    lobbyCap: 12,
  },
  "mario-kart-world": {
    slug: "mario-kart-world",
    title: "Mario Kart World",
    data: mkworldData as unknown as GameData,
    hasWheels: false,
    hasGlider: false,
    lobbyCap: 24,
  },
};

export function getTwitchGame(slug: string | null | undefined): TwitchGameEntry | null {
  if (!slug) return null;
  return TWITCH_GAMES[slug] ?? null;
}
