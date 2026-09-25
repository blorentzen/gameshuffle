"use client";

/**
 * The one bar an owner sees on top of a surface that is theirs.
 *
 * Before this there were four answers to "edit this page": /c opened a modal,
 * /u threw you out to /account?tab=profile#personalize, an event linked to its
 * /manage route, and /live had nothing at all. Same intent, three
 * implementations and a gap, so owners had to learn each surface separately.
 *
 * The split the bar encodes:
 *   CUSTOMIZE  changes how the page LOOKS — accent, skin, banner, tagline,
 *              which sections show. Edited in place, because you cannot judge
 *              a colour in a dialog that covers the thing you are colouring.
 *   MANAGE     changes what the thing DOES — seeding, rosters, tickets,
 *              schedules. Links out to the surface that already owns that job.
 *
 * A surface passes whichever of the two it has. Events only ever had Manage,
 * /live only ever gets Customize, and neither has to fake the other.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@empac/cascadeds";

export interface OwnerBarProps {
  /** Left-hand text: "You're the organizer", "This is your live page". */
  note: ReactNode;
  /** Appearance editor trigger. Rendered in place, never navigates. */
  customize?: ReactNode;
  /** Operations surface. A route, because that work needs the room. */
  manageHref?: string | null;
  manageLabel?: string;
  /** Extra classes for surfaces that tint the bar with the owner's brand. */
  className?: string;
}

export function OwnerBar({ note, customize, manageHref, manageLabel = "Manage", className }: OwnerBarProps) {
  // Nothing to offer means no bar. A strip that only restates "this is yours"
  // is chrome, not an affordance.
  if (!customize && !manageHref) return null;

  return (
    <div className={`owner-bar${className ? ` ${className}` : ""}`}>
      <span className="owner-bar__note">{note}</span>
      <span className="owner-bar__actions">
        {customize}
        {manageHref && (
          <Link href={manageHref} className="owner-bar__manage">
            <Button variant={customize ? "secondary" : "primary"} size="small">{manageLabel}</Button>
          </Link>
        )}
      </span>
    </div>
  );
}
