/**
 * Timezone-aware event time formatting.
 *
 * A tournament (or any scheduled event) is stored as a single UTC instant
 * (`timestamptz`). How we render it depends on the viewer:
 *
 *   • Viewer has an account timezone → render in THAT zone, labeled, with a
 *     "your time" hint so it's unmistakably personalized.
 *   • Otherwise (logged out, or no timezone set) → render in the platform
 *     default: Pacific AND Eastern (US), both labeled — so a US audience always
 *     sees an unambiguous time regardless of where they are.
 *
 * All formatting goes through `Intl.DateTimeFormat` with an explicit `timeZone`,
 * so it's correct on the server (emails, SSR) and the client alike.
 */

export const PLATFORM_TZ = {
  pacific: "America/Los_Angeles",
  eastern: "America/New_York",
} as const;

function fmtDate(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(d);
}

function fmtTime(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/** Non-DST 2-letter US label where we can (PT/ET/CT/MT); otherwise Intl's short
 *  name (e.g. "GMT+2", "AKDT"). We show the generic form so it reads cleanly and
 *  doesn't flip PST↔PDT on people. */
function zoneLabel(d: Date, timeZone: string): string {
  const short =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  const map: Record<string, string> = {
    PDT: "PT", PST: "PT",
    EDT: "ET", EST: "ET",
    CDT: "CT", CST: "CT",
    MDT: "MT", MST: "MT",
  };
  return map[short] ?? short;
}

function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Format an event's start time for display.
 *
 * @param iso        The stored UTC instant (ISO string). Null/empty → "".
 * @param viewerTz   The viewer's IANA timezone, or null to use PT/ET default.
 * @returns          A single labeled string, e.g.
 *                     "Sat, Aug 15 · 1:00 PM CT (your time)"           (viewer tz)
 *                     "Sat, Aug 15 · 1:00 PM PT / 4:00 PM ET"          (default, same day)
 *                     "Sat, Aug 15 · 10:00 PM PT / Sun, Aug 16 · 1:00 AM ET" (crosses midnight)
 */
export function formatEventTime(iso: string | null | undefined, viewerTz?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  // Personalized: the viewer's own zone.
  if (isValidTimeZone(viewerTz)) {
    return `${fmtDate(d, viewerTz)} · ${fmtTime(d, viewerTz)} ${zoneLabel(d, viewerTz)} (your time)`;
  }

  // Default: Pacific + Eastern.
  const { pacific, eastern } = PLATFORM_TZ;
  const ptDate = fmtDate(d, pacific);
  const etDate = fmtDate(d, eastern);
  const pt = `${fmtTime(d, pacific)} ${zoneLabel(d, pacific)}`;
  const et = `${fmtTime(d, eastern)} ${zoneLabel(d, eastern)}`;

  if (ptDate === etDate) {
    return `${ptDate} · ${pt} / ${et}`;
  }
  // Rare: the event crosses local midnight between the coasts — date each side.
  return `${ptDate} · ${pt} / ${etDate} · ${et}`;
}

/** A short label for a zone right now (e.g. "CT", "PT", or "GMT+2"). */
export function currentZoneLabel(timeZone: string): string {
  return zoneLabel(new Date(), timeZone);
}

/** The browser's best-guess IANA timezone, or null if unavailable. */
export function detectBrowserTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(tz) ? tz : null;
  } catch {
    return null;
  }
}

/** All IANA zones for a picker; falls back to a small curated list on older runtimes. */
export function allTimeZones(): string[] {
  const withValues = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  if (typeof withValues.supportedValuesOf === "function") {
    try {
      return withValues.supportedValuesOf("timeZone");
    } catch {
      /* fall through */
    }
  }
  return [
    "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York",
    "America/Anchorage", "Pacific/Honolulu", "America/Sao_Paulo", "Europe/London",
    "Europe/Paris", "Europe/Berlin", "Asia/Tokyo", "Asia/Shanghai",
    "Asia/Kolkata", "Australia/Sydney", "UTC",
  ];
}

export { isValidTimeZone };
