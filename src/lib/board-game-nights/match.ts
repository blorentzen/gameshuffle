/**
 * Pure discovery helpers for board-game nights: distance (haversine) and a
 * preference match score. No dependencies + no server-only, so both the hub
 * browser (client) and any future "who fits this night" surface can share them.
 */

export interface ViewerPrefs {
  genres: string[];
  level: string | null;
  lengths: string[];
}

export interface NightMatchInput {
  genres: string[];
  level: string | null;
  /** Distinct lengths across the games being brought. */
  gameLengths: string[];
}

/** Case-insensitive set intersection count. */
function overlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const set = new Set(b.map((x) => x.toLowerCase().trim()));
  let n = 0;
  for (const x of a) if (set.has(x.toLowerCase().trim())) n += 1;
  return n;
}

/**
 * Preference match score. Level match is the strongest signal, then shared
 * genres, then a light nudge for matching game length. 0 = no signal.
 */
export function matchScore(prefs: ViewerPrefs, night: NightMatchInput): number {
  let score = 0;
  if (prefs.level && night.level && prefs.level === night.level) score += 3;
  score += overlap(prefs.genres, night.genres) * 2;
  if (overlap(prefs.lengths, night.gameLengths) > 0) score += 1;
  return score;
}

/** Whether a score is strong enough to badge as a good fit. */
export function isGoodMatch(score: number): boolean {
  return score >= 3;
}

const EARTH_RADIUS_MI = 3958.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in miles between two lat/lng points. */
export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Short human distance label, e.g. "0.4 mi", "12 mi". */
export function formatMiles(mi: number): string {
  if (mi < 0.1) return "here";
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}
