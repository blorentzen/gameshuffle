"use client";

/**
 * The navbar's standing ask (Britton's picks, 2026-10-19, support first plan):
 * a heart "Support" button where "Go Pro" used to be, for visitors and free
 * accounts. GS Pro members (Backers and Champions included) and supporters get
 * a small thank-you heart instead, leading to Account ▸ Support GameShuffle.
 * Signed out it never looks anything up; signed in it shares the page's one
 * support status lookup. Hidden on phones like the old button (the menu has it).
 */

import Link from "next/link";
import { IconHeart, IconHeartFilled } from "@tabler/icons-react";
import { useSupportStatus } from "@/components/support/useSupportStatus";
import { EVENTS, tagged } from "@/lib/analytics/events";

function SupportButton() {
  return (
    <Link href="/support" className={`gs-nav__support ${tagged(EVENTS.supportClicked, { from: "navbar" })}`}>
      <IconHeart size={16} stroke={2.25} aria-hidden="true" />
      Support
    </Link>
  );
}

function SignedInSupport({ paid }: { paid: boolean }) {
  const status = useSupportStatus();
  if (paid || status?.supporter) {
    return (
      <Link href="/account?tab=support" className="gs-nav__thanks" aria-label="Thank you for supporting GameShuffle" title="Thank you for supporting GameShuffle">
        <IconHeartFilled size={18} aria-hidden="true" />
      </Link>
    );
  }
  return <SupportButton />;
}

export function NavSupport({ signedIn, paid }: { signedIn: boolean; paid: boolean }) {
  return signedIn ? <SignedInSupport paid={paid} /> : <SupportButton />;
}
