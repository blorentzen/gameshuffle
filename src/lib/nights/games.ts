import { PARTY_FAMILY, PARTY_GAMES } from "@/data/party";
import { SMASH_FAMILY } from "@/data/smash/cards";
import { ULTIMATE } from "@/data/smash/ultimate";

/**
 * Games a live night can run (multi-game nights). Client-safe. Each entry
 * says which card deck applies (null: placements only), what the tracker
 * counts and how long a game runs when its setup doesn't say.
 */
export interface NightGame {
  slug: string;
  label: string;
  /** Short label for chips and the lineup. */
  short: string;
  family: string | null;
  unit: "turn" | "game" | "race";
  defaultLength: number;
}

export const NIGHT_GAMES: NightGame[] = [
  { slug: "mario-kart-8-deluxe", label: "Mario Kart 8 Deluxe", short: "MK8 Deluxe", family: null, unit: "race", defaultLength: 8 },
  { slug: "mario-kart-world", label: "Mario Kart World", short: "MK World", family: null, unit: "race", defaultLength: 8 },
  ...Object.values(PARTY_GAMES).map((g): NightGame => ({
    slug: g.slug, label: g.label, short: g.label.replace("Super Mario Party ", "").replace("Mario Party ", ""), family: PARTY_FAMILY, unit: "turn", defaultLength: 20,
  })),
  { slug: ULTIMATE.slug, label: ULTIMATE.label, short: "Smash", family: SMASH_FAMILY, unit: "game", defaultLength: 10 },
];

export function nightGame(slug: string | null | undefined): NightGame | null {
  return NIGHT_GAMES.find((g) => g.slug === slug) ?? null;
}

/** Night points for a finishing place (1-based): 10, 6, 3, 1 for the top four. */
export const NIGHT_CURVE = [10, 6, 3, 1];
export function placePoints(place: number): number {
  return NIGHT_CURVE[place - 1] ?? 0;
}

/** At most this many games in one night. */
export const NIGHT_MAX_GAMES = 12;

export function unitLabel(unit: NightGame["unit"], plural = false): string {
  const word = unit === "turn" ? "turn" : unit === "race" ? "race" : "game";
  return plural ? `${word}s` : word;
}
