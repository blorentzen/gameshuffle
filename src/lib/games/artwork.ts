/**
 * Game artwork catalog — central registry of CDN-hosted game artwork
 * used across the Hub, Status Strip, Modules tab, Configure multi-select,
 * and live-view surfaces.
 *
 * GS_DEFAULT is treated as a first-class entry, not just a fallback. Per
 * Britton's UX direction (2026-05-01): "GS Queue" is the persistent
 * universal floor — when active_game is null (stream offline, unsupported
 * Twitch category, or a session in queue-only mode), the GS Queue
 * artwork represents that state visually rather than rendering a
 * data-missing placeholder.
 *
 * Slug convention matches `gs_sessions.config.game` / `active_game` /
 * `configured_games[]` / `twitch_game_categories.randomizer_slug` —
 * kebab-case Twitch-derived slugs. The special `gs_default` slug exists
 * only here and on a few UI surfaces; it never lands in DB columns.
 */

import { GAME_ART } from "@/data/game-art";
import { randomizerPublic } from "@/lib/games-visibility";

export const GS_DEFAULT_SLUG = "gs_default" as const;

export interface GameArtworkEntry {
  /** Display name used as a badge/tooltip. */
  name: string;
  /** Short label for compact spots (chips, mobile). */
  shortName: string;
  /** Full-bleed CDN artwork URL. */
  artworkUrl: string;
  /** Accent color for badges / borders, expressed as a CSS-variable
   *  fallback chain. Used by the Status Strip to tint per active game. */
  accent: string;
}

/**
 * Authoritative artwork map. Add a new entry when GameShuffle gains a
 * new supported game; the Modules / Configure / Status surfaces look up
 * by slug here so a single edit propagates.
 */
export const GAME_ARTWORK: Record<string, GameArtworkEntry> = {
  "mario-kart-8-deluxe": {
    name: "Mario Kart 8 Deluxe",
    shortName: "MK8DX",
    artworkUrl:
      "https://cdn.empac.co/gameshuffle/images/game-artwork/mk8dx-artwork.jpg",
    accent: "#e60012",
  },
  "mario-kart-world": {
    name: "Mario Kart World",
    shortName: "MKWorld",
    artworkUrl:
      "https://cdn.empac.co/gameshuffle/images/game-artwork/mariokartworld-artwork.jpg",
    accent: "#0050a0",
  },
  /* Every other game with chat rolls (src/lib/twitch/chatGames.ts), on its
     randomizer header art. */
  "mario-kart-64": { name: "Mario Kart 64", shortName: "MK64", artworkUrl: GAME_ART["mario-kart-64"].hero.src, accent: "#e60012" },
  "super-smash-bros-ultimate": { name: "Super Smash Bros. Ultimate", shortName: "Smash", artworkUrl: GAME_ART["super-smash-bros-ultimate"].hero.src, accent: "#d33a2c" },
  "super-mario-party-jamboree": { name: "Super Mario Party Jamboree", shortName: "Jamboree", artworkUrl: "https://cdn.empac.co/gameshuffle/images/mario-party-jamboree/mario-party-jamboree-hero.avif", accent: "#e8a317" },
  "mario-party-superstars": { name: "Mario Party Superstars", shortName: "Superstars", artworkUrl: "https://cdn.empac.co/gameshuffle/images/mario-party-superstars/mario-party-superstars-hero.jpg", accent: "#e8a317" },
  "mario-party": { name: "Mario Party", shortName: "MP1", artworkUrl: GAME_ART["mario-party"].hero.src, accent: "#e8a317" },
  "mario-party-2": { name: "Mario Party 2", shortName: "MP2", artworkUrl: GAME_ART["mario-party-2"].hero.src, accent: "#e8a317" },
  "mario-party-3": { name: "Mario Party 3", shortName: "MP3", artworkUrl: GAME_ART["mario-party-3"].hero.src, accent: "#e8a317" },
  "overwatch": { name: "Overwatch", shortName: "Overwatch", artworkUrl: GAME_ART["overwatch"].hero.src, accent: "#f08a1c" },
  "marvel-rivals": { name: "Marvel Rivals", shortName: "Rivals", artworkUrl: GAME_ART["marvel-rivals"].hero.src, accent: "#d4303d" },
  "splatoon-3": { name: "Splatoon 3", shortName: "Splatoon", artworkUrl: GAME_ART["splatoon-3"].hero.src, accent: "#b9e02a" },
  "kirby-air-riders": { name: "Kirby Air Riders", shortName: "Air Riders", artworkUrl: GAME_ART["kirby-air-riders"].hero.src, accent: "#f08bb4" },
  "goldeneye-007": { name: "GoldenEye 007", shortName: "GoldenEye", artworkUrl: GAME_ART["goldeneye-007"].hero.src, accent: "#8a7a3a" },
  "perfect-dark": { name: "Perfect Dark", shortName: "Perfect Dark", artworkUrl: GAME_ART["perfect-dark"].hero.src, accent: "#8a1c2b" },
  "pokemon-stadium": { name: "Pokémon Stadium", shortName: "Stadium", artworkUrl: GAME_ART["pokemon-stadium"].hero.src, accent: "#d9502a" },
  "pokemon-stadium-2": { name: "Pokémon Stadium 2", shortName: "Stadium 2", artworkUrl: GAME_ART["pokemon-stadium-2"].hero.src, accent: "#d9502a" },
  [GS_DEFAULT_SLUG]: {
    name: "GS Queue",
    shortName: "GS Queue",
    artworkUrl:
      "https://cdn.empac.co/gameshuffle/images/game-artwork/gs-default-artwork.jpg",
    accent: "var(--primary-500)",
  },
};

/**
 * Look up artwork for a game slug. Returns the GS_DEFAULT entry when the
 * slug is null, undefined, or unknown — callers don't need to check for
 * the queue-fallback case separately.
 */
export function getGameArtwork(slug: string | null | undefined): GameArtworkEntry {
  if (!slug) return GAME_ARTWORK[GS_DEFAULT_SLUG];
  return GAME_ARTWORK[slug] ?? GAME_ARTWORK[GS_DEFAULT_SLUG];
}

/**
 * Returns true when `slug` is a real game with artwork (i.e. not the
 * queue-fallback placeholder). Use this to decide whether to render a
 * per-game module surface or fall through to the queue.
 */
export function isSupportedGame(slug: string | null | undefined): slug is string {
  if (!slug) return false;
  if (slug === GS_DEFAULT_SLUG) return false;
  return slug in GAME_ARTWORK;
}

/** Pokémon Stadium 2 rides on the Stadium randomizer page, so it follows that page's flag. */
const PAGE_FOR: Record<string, string> = { "pokemon-stadium-2": "pokemon-stadium" };

/** All supported game slugs (excluding GS_DEFAULT and games still hidden on the site). Stable iteration order. */
export const SUPPORTED_GAME_SLUGS: readonly string[] = Object.keys(
  GAME_ARTWORK
).filter((slug) => slug !== GS_DEFAULT_SLUG && randomizerPublic(PAGE_FOR[slug] ?? slug));
