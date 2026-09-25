/**
 * Which generated-art family a surface wears.
 *
 * Lives here rather than in EventHeaderArt because that file is "use client",
 * and a pure mapping function behind a client boundary cannot be called from a
 * server component — /c/[slug] renders its game-night cards on the server and
 * hit exactly that. The type is erased at build time, but the function is not.
 */

/**
 * Event families, plus the ones the marketing pillars need. One enum because
 * this is an ART category, not an event type.
 */
export type ArtCategory =
  | "compete" | "board" | "video" | "tcg" | "mixed"
  | "stream" | "tools" | "series";

/** Map an event onto its art family. */
export function artCategoryFor(type: "tournament" | "game-night", kind?: string | null): ArtCategory {
  // A championship passes kind "series": it is in the tournament family but a
  // season of them should not wear the same art as one night's bracket.
  if (kind === "series") return "series";
  if (type === "tournament") return "compete";
  if (kind === "video" || kind === "tcg" || kind === "mixed") return kind;
  return "board";
}
