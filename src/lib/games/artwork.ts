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

/** All supported game slugs (excluding GS_DEFAULT). Stable iteration order. */
export const SUPPORTED_GAME_SLUGS: readonly string[] = Object.keys(
  GAME_ARTWORK
).filter((slug) => slug !== GS_DEFAULT_SLUG);
