/**
 * Route categories — the "interactions" a streamer can route to specific Discord
 * channels (Discord Bot suite, Spec 1). Client-safe (plain data), imported by the
 * routing board UI, the routes API (validation), and the adapter resolver.
 *
 * Category-level granularity for now; individual event types can be added here
 * later with no schema change (the routes table keys on `category` as text).
 */

export interface RouteCategoryDef {
  key: string;
  label: string;
  desc: string;
  /** Emoji glyph for the interaction card. */
  glyph: string;
}

export const ROUTE_CATEGORIES: readonly RouteCategoryDef[] = [
  { key: "stream", label: "Stream live", desc: "Went-live announce, game pivots, and wrap-up", glyph: "🔴" },
  { key: "rounds", label: "Picks & bans", desc: "Round open / close posts", glyph: "🗳️" },
  { key: "recap", label: "Session recap", desc: "End-of-stream summary", glyph: "📊" },
  { key: "qotd", label: "Question of the Day", desc: "Daily QOTD post", glyph: "💬" },
  { key: "game_nights", label: "Game nights", desc: "Game-night posts announced from the feed", glyph: "🎮" },
  { key: "announcements", label: "Announcements", desc: "Manual + scheduled announcements", glyph: "📣" },
] as const;

export type RouteCategory = (typeof ROUTE_CATEGORIES)[number]["key"];

export const ROUTE_CATEGORY_KEYS: string[] = ROUTE_CATEGORIES.map((c) => c.key);

export function isRouteCategory(value: string): boolean {
  return ROUTE_CATEGORY_KEYS.includes(value);
}
