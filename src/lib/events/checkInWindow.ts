/**
 * When check-in is open, and what an entrant should be told.
 *
 * Pure, and shared by the public tournament page (self check-in), the manage
 * page (the drop-or-keep step) and the reminder that links into it, so those
 * three can never disagree about whether the window is open.
 *
 * The window opens `opensMinutes` before the start time and closes AT the start
 * time. Closing at start is deliberate: the point of check-in is to know who is
 * in the room when the draw happens, and a window that runs past the start
 * cannot answer that.
 */

export type CheckInPhase = "disabled" | "no_start_time" | "before" | "open" | "closed";

export interface CheckInWindow {
  phase: CheckInPhase;
  opensAt: Date | null;
  closesAt: Date | null;
  /** Whether an entrant can check themselves in right now. */
  canCheckIn: boolean;
}

export interface CheckInConfig {
  enabled?: boolean | null;
  opensMinutes?: number | null;
  startsAt?: string | Date | null;
}

const DEFAULT_OPENS_MINUTES = 60;

export function checkInWindow(cfg: CheckInConfig, now: Date = new Date()): CheckInWindow {
  const off = { opensAt: null, closesAt: null, canCheckIn: false };

  // Absent column reads as enabled: the migration defaults it true, and a
  // tournament that predates it should behave the same way afterwards.
  if (cfg.enabled === false) return { phase: "disabled", ...off };

  const start = cfg.startsAt ? new Date(cfg.startsAt) : null;
  // Check-in is measured against the start, so an undated tournament has no
  // window to be inside. Not an error, just not applicable.
  if (!start || Number.isNaN(start.getTime())) return { phase: "no_start_time", ...off };

  const mins = cfg.opensMinutes ?? DEFAULT_OPENS_MINUTES;
  const opensAt = new Date(start.getTime() - mins * 60_000);

  if (now < opensAt) return { phase: "before", opensAt, closesAt: start, canCheckIn: false };
  if (now >= start) return { phase: "closed", opensAt, closesAt: start, canCheckIn: false };
  return { phase: "open", opensAt, closesAt: start, canCheckIn: true };
}

/** One line for an entrant, in their own words rather than the system's. */
export function checkInMessage(w: CheckInWindow, locale?: string): string | null {
  const time = (d: Date) => d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  switch (w.phase) {
    case "open":
      return `Check-in is open until ${time(w.closesAt!)}.`;
    case "before":
      return `Check-in opens at ${time(w.opensAt!)}.`;
    case "closed":
      return "Check-in has closed.";
    default:
      return null;
  }
}
