import { PARTY_FAMILY, PARTY_GAMES } from "@/data/party";
import { SMASH_FAMILY } from "@/data/smash/cards";
import { ULTIMATE } from "@/data/smash/ultimate";
import { GOLDENEYE_PUBLIC, KIRBY_PUBLIC, MK64_PUBLIC, PERFECT_DARK_PUBLIC, SMASH_PUBLIC } from "@/lib/games-visibility";

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
  unit: "turn" | "game" | "race" | "round";
  defaultLength: number;
  /** "activity": played on the phones and the TV (a GameShuffle Original), not on a console. */
  kind?: "console" | "activity";
}

/** GameShuffle Originals a night can run between (or instead of) console games. */
export const NIGHT_ACTIVITIES: NightGame[] = [
  { slug: "odd-one-out", label: "Odd One Out", short: "Odd One Out", family: null, unit: "round", defaultLength: 5, kind: "activity" },
  { slug: "most-likely-to", label: "Most Likely To", short: "Most Likely To", family: null, unit: "round", defaultLength: 8, kind: "activity" },
  { slug: "tier-wars", label: "Tier Wars", short: "Tier Wars", family: null, unit: "round", defaultLength: 4, kind: "activity" },
  { slug: "draft-night", label: "Draft Night", short: "Draft", family: null, unit: "round", defaultLength: 1, kind: "activity" },
  { slug: "number-bingo", label: "Number Bingo", short: "Bingo", family: null, unit: "round", defaultLength: 3, kind: "activity" },
];

export const NIGHT_GAMES: NightGame[] = [
  { slug: "mario-kart-8-deluxe", label: "Mario Kart 8 Deluxe", short: "MK8 Deluxe", family: null, unit: "race", defaultLength: 8 },
  { slug: "mario-kart-world", label: "Mario Kart World", short: "MK World", family: null, unit: "race", defaultLength: 8 },
  ...Object.values(PARTY_GAMES).map((g): NightGame => ({
    slug: g.slug, label: g.label, short: g.label.replace("Super Mario Party ", "").replace("Mario Party ", ""), family: PARTY_FAMILY, unit: "turn", defaultLength: 20,
  })),
  ...(SMASH_PUBLIC ? [{ slug: ULTIMATE.slug, label: ULTIMATE.label, short: "Smash", family: SMASH_FAMILY, unit: "game" as const, defaultLength: 10 }] : []),
  // Couch multiplayer on one console (up to 4 split-screen); placements only, no card deck yet.
  ...(KIRBY_PUBLIC ? [{ slug: "kirby-air-riders", label: "Kirby Air Riders", short: "Kirby", family: null, unit: "race" as const, defaultLength: 6 }] : []),
  ...(MK64_PUBLIC ? [{ slug: "mario-kart-64", label: "Mario Kart 64", short: "MK64", family: null, unit: "race" as const, defaultLength: 8 }] : []),
  ...(GOLDENEYE_PUBLIC ? [{ slug: "goldeneye-007", label: "GoldenEye 007", short: "GoldenEye", family: null, unit: "game" as const, defaultLength: 5 }] : []),
  ...(PERFECT_DARK_PUBLIC ? [{ slug: "perfect-dark", label: "Perfect Dark", short: "Perfect Dark", family: null, unit: "game" as const, defaultLength: 5 }] : []),
  ...NIGHT_ACTIVITIES,
];

export function isActivity(slug: string | null | undefined): boolean {
  return nightGame(slug)?.kind === "activity";
}

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
  const word = unit === "turn" ? "turn" : unit === "race" ? "race" : unit === "round" ? "round" : "game";
  return plural ? `${word}s` : word;
}
