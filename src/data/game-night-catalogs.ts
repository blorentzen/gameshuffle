/**
 * Starter catalogs for non-board game nights. Same job as
 * `board-game-catalog.ts` (instant, offline suggestions in the "games being
 * brought" picker) but for the video-game and TCG kinds, where there is no BGG.
 * Cover art is the artwork we already host for the randomizers / favourite
 * games picker; anything without art falls back to the initials tile.
 */

import type { NightKind, NightLength } from "@/lib/game-nights/types";
import { FAVORITE_GAME_CATALOG } from "./favorite-games";

export interface StarterEntry {
  name: string;
  length: NightLength;
  imageUrl?: string | null;
}

const art = (name: string): string | null =>
  FAVORITE_GAME_CATALOG.find((g) => g.name === name)?.image ?? null;

export const STARTER_VIDEO_GAMES: StarterEntry[] = [
  { name: "Mario Kart World", length: "moderate", imageUrl: art("Mario Kart World") },
  { name: "Mario Kart 8 Deluxe", length: "moderate", imageUrl: art("Mario Kart 8 Deluxe") },
  { name: "Super Smash Bros. Ultimate", length: "quick", imageUrl: art("Super Smash Bros. Ultimate") },
  { name: "Mario Party", length: "long", imageUrl: art("Mario Party") },
  { name: "Jackbox Party Pack", length: "moderate", imageUrl: art("Jackbox") },
  { name: "Overcooked! 2", length: "quick" },
  { name: "Rocket League", length: "quick" },
  { name: "Street Fighter 6", length: "quick" },
  { name: "Tekken 8", length: "quick" },
  { name: "Mortal Kombat 1", length: "quick" },
  { name: "Nintendo Switch Sports", length: "quick" },
  { name: "Wii Sports", length: "quick" },
  { name: "Just Dance", length: "moderate" },
  { name: "Guitar Hero", length: "moderate" },
  { name: "Rock Band 4", length: "moderate" },
  { name: "Golf With Your Friends", length: "moderate" },
  { name: "Gang Beasts", length: "quick" },
  { name: "Fall Guys", length: "quick" },
  { name: "Among Us", length: "quick" },
  { name: "Lethal Company", length: "moderate" },
  { name: "Minecraft", length: "long" },
  { name: "Halo Infinite", length: "moderate" },
  { name: "Call of Duty", length: "moderate" },
  { name: "Fortnite", length: "moderate" },
  { name: "Valorant", length: "moderate" },
  { name: "League of Legends", length: "long" },
  { name: "Counter-Strike 2", length: "moderate" },
  { name: "Apex Legends", length: "moderate" },
  { name: "FIFA / EA Sports FC", length: "quick" },
  { name: "NBA 2K", length: "quick" },
  { name: "Madden NFL", length: "quick" },
  { name: "Splatoon 3", length: "quick" },
  { name: "Pokémon Scarlet & Violet", length: "moderate" },
  { name: "Pokémon Unite", length: "quick" },
  { name: "Puyo Puyo Tetris 2", length: "quick" },
  { name: "Towerfall Ascension", length: "quick" },
  { name: "Ultimate Chicken Horse", length: "quick" },
  { name: "Moving Out", length: "quick" },
  { name: "It Takes Two", length: "long" },
  { name: "Castle Crashers", length: "moderate" },
  { name: "Cuphead", length: "moderate" },
  { name: "Streets of Rage 4", length: "moderate" },
  { name: "Retro night (NES / SNES / N64)", length: "long" },
];

export const STARTER_TCGS: StarterEntry[] = [
  { name: "Pokémon TCG", length: "moderate", imageUrl: art("Pokémon TCG") },
  { name: "Pokémon TCG Pocket", length: "quick", imageUrl: art("Pokémon TCG") },
  { name: "Magic: The Gathering", length: "moderate" },
  { name: "Magic: The Gathering – Commander", length: "long" },
  { name: "Magic: The Gathering – Draft", length: "long" },
  { name: "Yu-Gi-Oh!", length: "moderate" },
  { name: "Disney Lorcana", length: "moderate" },
  { name: "One Piece Card Game", length: "moderate" },
  { name: "Star Wars: Unlimited", length: "moderate" },
  { name: "Flesh and Blood", length: "moderate" },
  { name: "Digimon Card Game", length: "moderate" },
  { name: "Dragon Ball Super Card Game", length: "moderate" },
  { name: "Riftbound (League of Legends TCG)", length: "moderate" },
  { name: "Cardfight!! Vanguard", length: "moderate" },
  { name: "Keyforge", length: "quick" },
  { name: "Grand Archive", length: "moderate" },
  { name: "Sorcery: Contested Realm", length: "moderate" },
  { name: "Weiss Schwarz", length: "moderate" },
  { name: "Union Arena", length: "moderate" },
  { name: "Altered", length: "moderate" },
];

function match(list: StarterEntry[], query: string, limit: number): StarterEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts = list.filter((g) => g.name.toLowerCase().startsWith(q));
  const contains = list.filter((g) => !g.name.toLowerCase().startsWith(q) && g.name.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, limit);
}

/** Kind-aware starter search. Board nights use the BGG-backed catalog; mixed
 *  nights search everything. */
export function searchStarterByKind(kind: NightKind | null | undefined, query: string, limit = 8): StarterEntry[] {
  if (kind === "video") return match(STARTER_VIDEO_GAMES, query, limit);
  if (kind === "tcg") return match(STARTER_TCGS, query, limit);
  if (kind === "mixed") return match([...STARTER_VIDEO_GAMES, ...STARTER_TCGS], query, limit);
  return [];
}
