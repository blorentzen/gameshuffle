/**
 * The check-in window, at its edges. Run: npx tsx scripts/test-checkin-window.ts
 *
 * Boundaries are the whole risk here: an off-by-one at the close means someone
 * checks in after the draw, and an off-by-one at the open means the reminder
 * links to a button that does nothing.
 */
import { checkInWindow, checkInMessage } from "../src/lib/events/checkInWindow";

const start = new Date("2026-10-01T19:00:00Z");
const at = (mins: number) => new Date(start.getTime() + mins * 60_000);
let failed = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

const w = (mins: number, cfg = {}) => checkInWindow({ startsAt: start, ...cfg }, at(mins));

check("61 min before: not yet", w(-61).phase, "before");
check("exactly 60 before: open", w(-60).phase, "open");
check("59 before: open", w(-59).phase, "open");
check("1 min before start: open", w(-1).phase, "open");
check("exactly at start: closed", w(0).phase, "closed");
check("after start: closed", w(30).phase, "closed");
check("custom 15 min, 20 before: not yet", w(-20, { opensMinutes: 15 }).phase, "before");
check("custom 15 min, 10 before: open", w(-10, { opensMinutes: 15 }).phase, "open");
check("disabled stays disabled inside the window", w(-30, { enabled: false }).phase, "disabled");
check("no start time", checkInWindow({ startsAt: null }).phase, "no_start_time");
check("undefined enabled reads as on", w(-30, { enabled: undefined }).phase, "open");
check("canCheckIn only when open", [w(-61).canCheckIn, w(-30).canCheckIn, w(5).canCheckIn], [false, true, false]);
check("closed message", checkInMessage(w(5)), "Check-in has closed.");
check("no message when not applicable", checkInMessage(w(-30, { enabled: false })), null);

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
