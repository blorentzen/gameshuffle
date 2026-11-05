"use client";

/** The nights' dates under the series' band, in the viewer's own time zone once the page has loaded. */

import { IconCalendar } from "@tabler/icons-react";
import { When } from "./SeriesBits";

export function HeroDates({ nights }: { nights: { id: string; label: string; startsAt: string | null }[] }) {
  const dated = nights.filter((n) => n.startsAt);
  if (!dated.length) return null;
  return (
    // Inline spans: the band puts its note inside a paragraph.
    <span className="ss-herodates" role="list" aria-label="Dates">
      {dated.map((n) => (
        <span key={n.id} role="listitem"><IconCalendar size={16} aria-hidden /> {n.label} <When iso={n.startsAt} /></span>
      ))}
    </span>
  );
}
