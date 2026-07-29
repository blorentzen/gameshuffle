import "server-only";

/**
 * Scrydex integration config — single source of truth (server-only).
 * Spec: specs/tcg-setup/scrydex-tcg-catalog-spec.md §0.
 *
 * The two vendor-authorization switches ship in their conservative,
 * reversible-safe default. Changing either is a one-line edit + redeploy —
 * NO migration, NO data purge (the schema already carries the self-host
 * columns nullable). When Scrydex answers in writing, update the value here
 * and record it in the spec's Authorization changelog.
 */

/** A1 default: 30-day TTL, re-fetch on stale read. `null` = indefinite
 *  retention — set ONLY after written Scrydex authorization. */
export const CATALOG_TTL_DAYS: number | null = 30;

/** A2 default: reference Scrydex image URLs directly, no self-hosting.
 *  Flip to `true` only after written authorization (enables Phase 5). */
export const SELF_HOST_IMAGES = false;

/** Far-future sentinel written to `stale_after` when TTL is indefinite. */
export const INDEFINITE_STALE_SENTINEL = "9999-12-31T00:00:00.000Z";

/** Scrydex Pokémon API base. */
export const SCRYDEX_BASE_URL = "https://api.scrydex.com/pokemon/v1";

/** Daily credit-spend alert threshold. A runaway loop should page us, not
 *  surface as a bill. Env-overridable so ops can tune without a deploy. */
export const DAILY_SPEND_ALERT_CREDITS = Number(
  process.env.SCRYDEX_DAILY_CREDIT_ALERT ?? 2000,
);

/** Per-user rate limit on /api/tcg/search — a hostile/buggy client must not
 *  be able to drain credits. Auth is the gate; this is the backstop. */
export const SEARCH_RATE_LIMIT = 30; // requests
export const SEARCH_RATE_WINDOW_MS = 60_000; // per minute

/** Compute the `stale_after` value for a freshly-fetched row. */
export function computeStaleAfter(now: Date = new Date(now_ms())): string {
  if (CATALOG_TTL_DAYS === null) return INDEFINITE_STALE_SENTINEL;
  return new Date(now.getTime() + CATALOG_TTL_DAYS * 86_400_000).toISOString();
}

// `Date.now()` is fine in server runtime (the workflow-script restriction does
// not apply here); wrapped so computeStaleAfter stays a pure-ish helper.
function now_ms(): number {
  return Date.now();
}
