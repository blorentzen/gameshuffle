/**
 * Coarse play-region for discovery, derived from a user's IANA timezone
 * (`users.timezone`, auto-detected on sign-in). Deriving avoids a dedicated
 * region column while still giving a "roughly my part of the world" filter for
 * finding players to game with. Isomorphic (safe on server or client).
 */

export const REGIONS = ["Americas", "Europe", "Asia", "Africa", "Oceania"] as const;
export type Region = (typeof REGIONS)[number];

/** Map an IANA timezone (e.g. "America/Los_Angeles") to a coarse region. */
export function regionFromTimezone(tz: string | null | undefined): Region | null {
  if (!tz) return null;
  const area = tz.split("/")[0];
  switch (area) {
    case "America":
      return "Americas";
    case "Europe":
      return "Europe";
    case "Asia":
      return "Asia";
    case "Africa":
      return "Africa";
    case "Australia":
    case "Pacific":
      return "Oceania";
    default:
      return null; // Atlantic/Indian/Etc/UTC → unknown, no false matches
  }
}

/** A Region string (from a query param) if valid, else null. */
export function asRegion(value: string | null | undefined): Region | null {
  return value && (REGIONS as readonly string[]).includes(value) ? (value as Region) : null;
}
