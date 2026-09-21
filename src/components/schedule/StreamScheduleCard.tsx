"use client";

/**
 * Read-only stream schedule display — a "next stream" line (relative to the
 * viewer's clock, shown in their local time) plus the recurring weekly slots in
 * the streamer's timezone. Surfaced on /u, /c, and /live.
 */

import { useEffect, useState } from "react";
import {
  WEEKDAYS,
  formatSlotTime,
  nextStreamOccurrence,
  tzAbbrev,
  type StreamSchedule,
} from "@/lib/schedule/streamSchedule";

function relative(at: Date, now: Date): string {
  const diff = at.getTime() - now.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "starting now";
  if (mins < 60) return `in ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs} hour${hrs === 1 ? "" : "s"}`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

export function StreamScheduleCard({ schedule, className }: { schedule: StreamSchedule; className?: string }) {
  // Compute against the viewer's clock on the client (avoids SSR/tz mismatch).
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // Client-only clock: set after mount so the "next stream" line uses the
    // viewer's real time without an SSR/hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const next = now ? nextStreamOccurrence(schedule, now) : null;
  const viewerLocal = next
    ? new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(next.at)
    : null;
  const label = tzAbbrev(schedule.timezone);

  // Group slots by weekday for a tidy list.
  const byDay = new Map<number, typeof schedule.slots>();
  for (const s of schedule.slots) {
    if (!byDay.has(s.day)) byDay.set(s.day, []);
    byDay.get(s.day)!.push(s);
  }

  return (
    <div className={`stream-schedule${className ? ` ${className}` : ""}`}>
      {next && now && (
        <div className="stream-schedule__next">
          <span className="stream-schedule__next-eyebrow">Next stream</span>
          <span className="stream-schedule__next-title">{next.slot.title || "Live"}</span>
          <span className="stream-schedule__next-when">{relative(next.at, now)} · {viewerLocal} your time</span>
        </div>
      )}
      <ul className="stream-schedule__list">
        {[...byDay.entries()].sort(([a], [b]) => a - b).map(([day, slots]) => (
          <li key={day} className="stream-schedule__row">
            <span className="stream-schedule__day">{WEEKDAYS[day]}</span>
            <span className="stream-schedule__slots">
              {slots.map((s, i) => (
                <span key={i} className="stream-schedule__slot">
                  {formatSlotTime(s.start)}{s.title ? ` · ${s.title}` : ""}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="stream-schedule__tz">Times in {label}</p>
    </div>
  );
}
