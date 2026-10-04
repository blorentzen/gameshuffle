"use client";

import { Alert } from "@empac/cascadeds";

/** Shown to organizers where ticketing and payouts would be, while paid entry is off. */
export function PaidEntryNotice() {
  return (
    <Alert variant="info" title="Paid entry is in the works">
      Events on GameShuffle are free to enter for now. Ticket sales and organizer payouts are built, and we&apos;re
      switching them on once the tax and organizer-agreement side is sorted. Everything else, from sign-up and the
      waitlist to check-in, works today.
    </Alert>
  );
}
