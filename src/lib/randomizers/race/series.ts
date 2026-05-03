/**
 * Pure helpers for the !gs-race [N] series argument. Lives outside the
 * chat-command module so the test surface can verify parsing without
 * dragging in server-only DB modules through the import graph.
 */

/** Max series length — caps chat output + DB write volume. Streamers
 *  wanting longer series can fire !gs-race 16 multiple times. */
export const MAX_SERIES_LENGTH = 16;

/**
 * Parse the `!gs-race [N]` argument. Returns the streamer-configured
 * default (or 1) when no arg is supplied. Clamps to [1, MAX_SERIES_LENGTH]
 * so a typo of `!gs-race 9999` doesn't blow up chat or write hundreds of
 * events.
 *
 * @param args         Raw arg string from chat (e.g. `"8"`, `""`, `"foo"`).
 * @param defaultLen   Per-session default from `RaceRandomizerConfig.
 *                     defaultSeriesLength`. Falls back to 1 when omitted
 *                     or invalid.
 */
export function parseSeriesLength(args: string, defaultLen?: number): number {
  const trimmed = args.trim();
  if (!trimmed) {
    if (
      typeof defaultLen === "number" &&
      Number.isFinite(defaultLen) &&
      defaultLen >= 1
    ) {
      return Math.min(Math.floor(defaultLen), MAX_SERIES_LENGTH);
    }
    return 1;
  }
  const n = parseInt(trimmed.split(/\s+/)[0], 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_SERIES_LENGTH);
}
