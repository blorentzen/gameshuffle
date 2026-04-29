/**
 * Relative-time formatter — "5m ago", "in 3 days", etc.
 *
 * Userland helper, not a CDS primitive. Approved as a Phase 4A workaround
 * per the CDS inventory C.1 decision (Intl.RelativeTimeFormat is in the
 * standard library; no external date library added to deps).
 *
 * Outputs are short-form ("5m ago", not "5 minutes ago") so they fit in
 * compact list-row metadata without wrapping. Pass the `verbose: true`
 * flag for the long form when there's room.
 *
 * Always returns a string suitable for direct rendering. For null /
 * undefined / unparseable inputs returns "—".
 */

const PLACEHOLDER = "—";

const DIVISIONS: Array<{
  amount: number;
  unit: Intl.RelativeTimeFormatUnit;
  short: string;
}> = [
  { amount: 60, unit: "second", short: "s" },
  { amount: 60, unit: "minute", short: "m" },
  { amount: 24, unit: "hour", short: "h" },
  { amount: 7, unit: "day", short: "d" },
  { amount: 4.34524, unit: "week", short: "w" },
  { amount: 12, unit: "month", short: "mo" },
  { amount: Number.POSITIVE_INFINITY, unit: "year", short: "y" },
];

/**
 * Format a date as a relative time string.
 *
 * @param input ISO timestamp string, Date, or null/undefined
 * @param opts.verbose true → "5 minutes ago"; false (default) → "5m ago"
 * @param opts.now    override "now" (mostly for testing)
 */
export function formatRelativeTime(
  input: string | Date | null | undefined,
  opts: { verbose?: boolean; now?: Date } = {}
): string {
  if (input == null) return PLACEHOLDER;
  const target = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(target.getTime())) return PLACEHOLDER;

  const now = opts.now ?? new Date();
  let diffSeconds = (target.getTime() - now.getTime()) / 1000;

  // Walk the divisions table to find the right unit + magnitude.
  for (const division of DIVISIONS) {
    if (Math.abs(diffSeconds) < division.amount) {
      const value = Math.round(diffSeconds);
      if (opts.verbose) {
        const fmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
        return fmt.format(value, division.unit);
      }
      // Compact form: "5m ago" / "in 3d"
      const abs = Math.abs(value);
      if (abs === 0) return "just now";
      const direction = value < 0 ? "ago" : "in";
      const compact = `${abs}${division.short}`;
      return direction === "ago" ? `${compact} ago` : `in ${compact}`;
    }
    diffSeconds /= division.amount;
  }
  return PLACEHOLDER;
}

/**
 * Format a duration in seconds as a compact string. Used for "session
 * lasted 47m" displays where the value isn't relative-to-now.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return PLACEHOLDER;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (remMins === 0) return `${hours}h`;
  return `${hours}h ${remMins}m`;
}
