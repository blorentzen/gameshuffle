/**
 * Pure helpers for the !gs-race [N] series argument. Lives outside the
 * chat-command module so the test surface can verify parsing without
 * dragging in server-only DB modules through the import graph.
 */

/** Max series length — caps chat output + DB write volume. Streamers
 *  wanting longer series can fire !gs-race 16 multiple times. */
export const MAX_SERIES_LENGTH = 16;

/**
 * Parse the `!gs-race [N]` argument. Returns 1 when no arg or
 * unparseable. Clamps to [1, MAX_SERIES_LENGTH] so a typo of
 * `!gs-race 9999` doesn't blow up chat or write hundreds of events.
 */
export function parseSeriesLength(args: string): number {
  const trimmed = args.trim();
  if (!trimmed) return 1;
  const n = parseInt(trimmed.split(/\s+/)[0], 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_SERIES_LENGTH);
}
