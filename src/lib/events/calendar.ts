/**
 * Add-to-calendar helpers shared by tournaments and game nights (client-safe).
 *
 * Two doors cover every calendar: a Google Calendar template link, and an
 * `.ics` file (Apple Calendar, Outlook, everything else) served by
 * `/api/events/[type]/[id]/ics`. Both are built from the same EventCalendarInput
 * so the two never disagree about when or where.
 */

export type EventType = "tournament" | "game-night";

export interface EventCalendarInput {
  type: EventType;
  id: string;
  title: string;
  startsAt: string | null;
  /** Defaults to start + DEFAULT_DURATION_MIN when absent. */
  endsAt?: string | null;
  description?: string | null;
  location?: string | null;
  /** Absolute URL of the event page (goes into the calendar entry). */
  url: string;
}

export const DEFAULT_DURATION_MIN = { tournament: 180, "game-night": 240 } as const;

/** 2026-09-21T19:00:00.000Z → 20260921T190000Z (calendar UTC stamp). */
export function toCalendarStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function eventEnd(input: Pick<EventCalendarInput, "type" | "startsAt" | "endsAt">): string | null {
  if (input.endsAt) return input.endsAt;
  if (!input.startsAt) return null;
  return new Date(new Date(input.startsAt).getTime() + DEFAULT_DURATION_MIN[input.type] * 60_000).toISOString();
}

export function googleCalendarUrl(input: EventCalendarInput): string | null {
  const end = eventEnd(input);
  if (!input.startsAt || !end) return null;
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${toCalendarStamp(input.startsAt)}/${toCalendarStamp(end)}`,
    details: [input.description?.trim(), input.url].filter(Boolean).join("\n\n"),
  });
  if (input.location) p.set("location", input.location);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** Path of the .ics download for this event (served by the API route). */
export function icsPath(type: EventType, id: string): string {
  return `/api/events/${type}/${id}/ics`;
}

/** Escape per RFC 5545 §3.3.11 (text values). */
function icsText(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold lines at 75 octets per RFC 5545 §3.1 (keeps strict parsers happy). */
const bytes = (s: string) => new TextEncoder().encode(s).length;
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (bytes(rest) > 75) {
    let cut = 75;
    while (bytes(rest.slice(0, cut)) > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

/** Build a complete VCALENDAR document for one event. */
export function buildIcs(input: EventCalendarInput): string | null {
  const end = eventEnd(input);
  if (!input.startsAt || !end) return null;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GameShuffle//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.type}-${input.id}@gameshuffle.co`,
    `DTSTAMP:${toCalendarStamp(new Date().toISOString())}`,
    `DTSTART:${toCalendarStamp(input.startsAt)}`,
    `DTEND:${toCalendarStamp(end)}`,
    `SUMMARY:${icsText(input.title)}`,
    `URL:${input.url}`,
    ...(input.description ? [`DESCRIPTION:${icsText(`${input.description.trim()}\n\n${input.url}`)}`] : [`DESCRIPTION:${icsText(input.url)}`]),
    ...(input.location ? [`LOCATION:${icsText(input.location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
