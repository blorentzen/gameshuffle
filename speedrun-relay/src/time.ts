// LiveSplit time strings to milliseconds. LiveSplit One's server sends "hh:mm:ss.fffffffff" (with "d." in front
// past a day and an ASCII minus for negative times); hand-typed and older forms like "1:07:30.70" or "45.2" work too.

const TIME_RE = /^([-−])?(?:(\d+)\.(?=\d+:\d+:))?(?:(\d+):)?(?:(\d+):)?(\d+)(?:[.,](\d+))?$/;

export function parseTime(input: unknown): number | null {
  if (typeof input !== "string") return null;
  const m = TIME_RE.exec(input.trim());
  if (!m) return null;
  const [, minus, days, a, b, secs, frac] = m;
  let hours = 0;
  let minutes = 0;
  if (a !== undefined && b !== undefined) {
    hours = Number(a);
    minutes = Number(b);
  } else if (a !== undefined) {
    minutes = Number(a);
  }
  const nanos = frac ? Number((frac + "000000000").slice(0, 9)) : 0;
  const whole = ((Number(days ?? 0) * 24 + hours) * 60 + minutes) * 60 + Number(secs);
  const ms = whole * 1000 + Math.round(nanos / 1e6);
  if (!Number.isFinite(ms)) return null;
  return minus && ms !== 0 ? -ms : ms;
}

/** For logs and tests: 125432 -> "2:05.432", -1500 -> "-0:01.500". */
export function formatMs(ms: number): string {
  const sign = ms < 0 ? "-" : "";
  let rest = Math.abs(Math.round(ms));
  const milli = rest % 1000;
  rest = Math.floor(rest / 1000);
  const s = rest % 60;
  rest = Math.floor(rest / 60);
  const m = rest % 60;
  const h = Math.floor(rest / 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${sign}${h > 0 ? h + ":" : ""}${mm}:${String(s).padStart(2, "0")}.${String(milli).padStart(3, "0")}`;
}
