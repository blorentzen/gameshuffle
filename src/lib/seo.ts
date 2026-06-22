/**
 * Canonical site host. Single source of truth for absolute URLs in
 * crawler-facing surfaces (metadataBase, JSON-LD, sitemap).
 *
 * The site standardizes on the **www** host; Vercel 301s the apex
 * (gameshuffle.co) → www at the edge. Keep canonicals, OG URLs, and
 * metadataBase all agreeing on this value.
 */
export const SITE_URL = "https://www.gameshuffle.co";
