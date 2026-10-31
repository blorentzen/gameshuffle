"use client";

/**
 * GS Pro for lounge players (lounge page picks, 2026-10-20, the approved pitch): one dark band
 * with three rows and the site's trial offer. On /lounge and at the foot of every player page;
 * /gs-pro shows the same rows (LOUNGE_PRO_ROWS) as its lounge section. Hidden for GS Pro viewers
 * (the server says so with `pro`; the browser's own check covers the rest). The offer follows the
 * other GS Pro walls: the trial line and checkout buttons when signed in (they turn into the
 * waitlist outside the US and drop the trial once it's used), a free account first when not.
 */

import Link from "next/link";
import { Button } from "@empac/cascadeds";
import { IconChartBar, IconFlag, IconPalette, type Icon } from "@tabler/icons-react";
import { ProUpgradeCtaButtons } from "@/components/account/ProUpgradeCtaButtons";
import { PaidPlansWaitlist } from "@/components/billing/PaidPlansWaitlist";
import { ProTerms } from "@/components/billing/ProTerms";
import { usePaidAvailability } from "@/components/billing/usePaidAvailability";
import { useTrialEligibility } from "@/components/billing/useTrialEligibility";
import { useToast } from "@/components/toast/ToastProvider";
import type { RowTone } from "@/components/marketing/RowPanel";
import { IconTile } from "@/components/ui/IconTile";
import { EVENTS, tagged } from "@/lib/analytics/events";

export const LOUNGE_PRO_ROWS: { key: string; Icon: Icon; tone: RowTone; title: string; text: string }[] = [
  { key: "patterns", Icon: IconChartBar, tone: "violet", title: "Your patterns", text: "Who you meet most and your record against them, when you play best, and when to stop for the night." },
  { key: "goals", Icon: IconFlag, tone: "orange", title: "Your goals", text: "Set tonight's number, and get a weekly report every Monday." },
  { key: "look", Icon: IconPalette, tone: "magenta", title: "Your look", text: "Your colors, picture and font on the MMR card, the overlay and Discord." },
];

function Offer() {
  const who = useTrialEligibility();
  const availability = usePaidAvailability();
  const toast = useToast();
  // Space kept until the browser knows who's looking and where, so the wrong offer never flashes.
  if (!who || !availability) return <div className="lounge-pro__offer" aria-hidden />;
  if (!availability.paidPlans.available) return <div className="lounge-pro__offer"><PaidPlansWaitlist product="pro" /></div>;
  if (!who.signedIn) {
    return (
      <div className="lounge-pro__offer">
        <ProTerms className="lounge-pro__terms" />
        <div>
          <Link href="/signup?redirect=/account?tab=plans" className={tagged(EVENTS.upgradeClicked, { from: "lounge" })}>
            <Button variant="primary">Try GS Pro free for 14 days</Button>
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="lounge-pro__offer">
      <ProTerms className="lounge-pro__terms" hasUsedTrial={who.hasUsedTrial} />
      <ProUpgradeCtaButtons hasUsedTrial={who.hasUsedTrial} from="lounge" onError={(m) => toast.error(m)} />
    </div>
  );
}

export function LoungeProBand({ pro }: { pro: boolean }) {
  const who = useTrialEligibility();
  if (pro || who?.isPro) return null;
  return (
    <section className="lounge-pro" id="lounge-pro" aria-labelledby="lounge-pro-title">
      <div className="lounge-pro__head">
        <p className="lounge-pro__eyebrow">GS Pro</p>
        <h2 id="lounge-pro-title">Know how you play, and show it</h2>
      </div>
      <ul className="lounge-pro__rows">
        {LOUNGE_PRO_ROWS.map((r) => (
          <li key={r.key}>
            <IconTile icon={r.Icon} tone={r.tone} />
            <span className="lounge-pro__copy"><b>{r.title}</b><span>{r.text}</span></span>
          </li>
        ))}
      </ul>
      <Offer />
    </section>
  );
}
