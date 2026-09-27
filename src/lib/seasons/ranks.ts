/**
 * Seasons: calendar months (UTC). Season points are the month's GS points
 * (placements, missions, awards...) from live nights. Client-safe.
 */

export interface SeasonRank { id: string; label: string; min: number }

/** Fixed thresholds, so a rank means the same thing in every community. */
export const SEASON_RANKS: SeasonRank[] = [
  { id: "rookie", label: "Rookie", min: 0 },
  { id: "bronze", label: "Bronze", min: 20 },
  { id: "silver", label: "Silver", min: 50 },
  { id: "gold", label: "Gold", min: 100 },
  { id: "platinum", label: "Platinum", min: 175 },
  { id: "superstar", label: "Superstar", min: 275 },
];

export function rankFor(points: number): SeasonRank {
  return [...SEASON_RANKS].reverse().find((r) => points >= r.min) ?? SEASON_RANKS[0];
}

/** The next rank up and how far away it is, or null at the top. */
export function nextRank(points: number): { rank: SeasonRank; needed: number } | null {
  const next = SEASON_RANKS.find((r) => r.min > points);
  return next ? { rank: next, needed: next.min - points } : null;
}

/** "2026-09" for a date (UTC). */
export function seasonKey(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function seasonRange(key: string): { start: string; end: string } {
  const [y, m] = key.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)).toISOString(), end: new Date(Date.UTC(y, m, 1)).toISOString() };
}

/** "September 2026" */
export function seasonLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function isSeasonKey(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/** Badge colour for a rank (CDS Badge variants). */
export function rankVariant(id: string): "default" | "info" | "success" | "warning" {
  return id === "superstar" || id === "platinum" ? "warning" : id === "gold" ? "success" : id === "silver" || id === "bronze" ? "info" : "default";
}
