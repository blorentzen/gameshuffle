import "server-only";

/**
 * BoardGameGeek integration config (server-only) — the Scrydex-mirrored
 * caching knobs for gs-board-game-nights Phase 2. We hit BGG only on a cache
 * miss/stale read; game details are cached in `bgg_games` with a TTL. No bulk
 * ingest, ever.
 */

/** BGG XML API2 base. */
export const BGG_BASE_URL = "https://boardgamegeek.com/xmlapi2";

/** Cached-detail freshness. Re-fetch a game's details on a stale read. */
export const CACHE_TTL_DAYS = 30;

/** Per-user search rate limit — BGG is slow + politely rate-limited on their
 *  end, and this is the backstop against a hostile/buggy client. Auth is the
 *  real gate. In-memory for now; move to Upstash for multi-instance scale. */
export const SEARCH_RATE_LIMIT = 20; // requests
export const SEARCH_RATE_WINDOW_MS = 60_000; // per minute

/** Don't spend a BGG call on a stub query. */
export const SEARCH_MIN_CHARS = 3;

/** Cap how many search hits we hydrate to details in one batched `/thing`. */
export const SEARCH_CACHE_MAX = 25;

export function computeStaleAfter(now: Date = new Date()): string {
  return new Date(now.getTime() + CACHE_TTL_DAYS * 86_400_000).toISOString();
}

/**
 * Map a BGG playing time (minutes) to our length bucket. Hosts can override
 * the per-game tag when they add it to a night, but this is the sensible
 * default: quick 10-20m, moderate 30-45m, long 1hr+.
 */
export function lengthBucket(
  minutes?: number | null,
): "quick" | "moderate" | "long" | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes <= 20) return "quick";
  if (minutes <= 45) return "moderate";
  return "long";
}
