/**
 * Run times. LiveSplit One sends times as strings ("00:08:00.100000000", "-00:00:01.5", "1:07:30.70"); the relay
 * turns them into milliseconds and the overlay writes them back the way speedrunners read them: "8:00.1",
 * "1:07:30.7", deltas as "2.3" or "1:05.4" (the arrow and color say ahead or behind). Times are cut to the tenth,
 * never rounded up, like LiveSplit: a clock never shows a tenth that hasn't happened yet. Pure.
 */

/** A LiveSplit time string to ms (null for anything that isn't one). Accepts h:m:s, m:s and s, with a sign. */
export function parseLsTime(input: unknown): number | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  const m = /^([+-])?(?:(\d+):)?(?:(\d+):)?(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  const [, sign, a, b, sec, frac] = m;
  // One colon group is minutes; two are hours and minutes.
  const hours = b !== undefined ? Number(a) : 0;
  const minutes = b !== undefined ? Number(b) : a !== undefined ? Number(a) : 0;
  const seconds = Number(sec);
  if (b !== undefined && minutes >= 60) return null;
  if ((a !== undefined || b !== undefined) && seconds >= 60) return null;
  const ms = frac ? Math.floor(Number(`0.${frac}`) * 1000 + 1e-6) : 0;
  const total = ((hours * 60 + minutes) * 60 + seconds) * 1000 + ms;
  if (!Number.isFinite(total)) return null;
  return sign === "-" ? -total : total;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A clock in two parts, so the tenths can be drawn smaller: { main: "1:01:52", frac: ".0" }. */
export function clockParts(ms: number): { main: string; frac: string; negative: boolean } {
  const negative = ms < 0;
  const t = Math.floor(Math.abs(ms) / 100);
  const h = Math.floor(t / 36000);
  const m = Math.floor((t % 36000) / 600);
  const s = Math.floor((t % 600) / 10);
  const d = t % 10;
  const main = h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  return { main: negative ? `-${main}` : main, frac: `.${d}`, negative };
}

/** "8:00.1", "1:07:30.7", "0:00.0". */
export function fmtClock(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "-";
  const p = clockParts(ms);
  return p.main + p.frac;
}

/** A gap without its sign: "2.3", "59.9", "1:05.4", "1:02:03.0". */
export function fmtDelta(ms: number): string {
  const t = Math.floor(Math.abs(ms) / 100);
  const h = Math.floor(t / 36000);
  const m = Math.floor((t % 36000) / 600);
  const s = Math.floor((t % 600) / 10);
  const d = t % 10;
  if (h) return `${h}:${pad(m)}:${pad(s)}.${d}`;
  return m ? `${m}:${pad(s)}.${d}` : `${s}.${d}`;
}
