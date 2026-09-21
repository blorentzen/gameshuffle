"use client";

import { useEffect, useState } from "react";
import type { EventType } from "@/lib/events/calendar";

/**
 * The attendee's ticket: a QR the organizer scans at the door plus a short code
 * to read out. Renders nothing until the server confirms the viewer is on the
 * list, so it can sit in the action panel unconditionally.
 */
export function TicketCard({ type, eventId }: { type: EventType; eventId: string }) {
  const [ticket, setTicket] = useState<{ code: string; status: string; checkedInAt: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/events/${type}/${eventId}/ticket`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { code: string; status: string; checkedInAt: string | null } | null) => { if (!cancelled && j) setTicket(j); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [type, eventId]);

  if (!ticket || ticket.status === "waitlisted") return null;
  const checked = !!ticket.checkedInAt || ticket.status === "checked_in";

  return (
    <div className={`comp-card ticket${checked ? " ticket--checked" : ""}`}>
      <div className="ticket__head">
        <span className="ticket__label">Your ticket</span>
        {checked ? <span className="ticket__status ticket__status--ok">Checked in</span> : <span className="ticket__status">Show this at the door</span>}
      </div>
      <div className="ticket__body">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/events/${type}/${eventId}/ticket?svg=1`} alt="Your ticket QR code" className="ticket__qr" width={160} height={160} />
        <div className="ticket__meta">
          <span className="ticket__code-label">Code</span>
          <span className="ticket__code">{ticket.code}</span>
          <span className="ticket__hint">If scanning fails, read the code to the organizer.</span>
        </div>
      </div>
    </div>
  );
}
