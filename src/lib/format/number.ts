/**
 * Compact number formatting for stat displays — 1,000 → "1K", 1,500 → "1.5K",
 * 1,000,000 → "1M", etc. Numbers under 1,000 render in full. Client-safe.
 */

const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function formatCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "0";
  if (Math.abs(n) < 1000) return String(Math.round(n));
  return COMPACT.format(n);
}
