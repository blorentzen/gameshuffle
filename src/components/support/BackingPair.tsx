"use client";

/**
 * Two ways to back GameShuffle (Britton's picks, 2026-10-19, VDh1QfETVjNTjjzeiKqLNg): Support and
 * GS Pro side by side, the same size and weight, on /gs-pro and /support; Support leads (support
 * first plan, same day), and its $9 Backer level includes GS Pro. GS Pro members see their
 * plan in the first card and can still support; a supporter sees since when and can give again.
 * Outside the US both are one waitlist (US only for now).
 */

import Link from "next/link";
import { Button, Card, Progress } from "@empac/cascadeds";
import { IconHeart, IconSparkles } from "@tabler/icons-react";
import { usePaidAvailability } from "@/components/billing/usePaidAvailability";
import { useTrialEligibility } from "@/components/billing/useTrialEligibility";
import { PaidPlansWaitlist } from "@/components/billing/PaidPlansWaitlist";
import { useSupportStatus } from "@/components/support/useSupportStatus";
import { usePublicPricing } from "@/lib/pricing/usePublicPricing";
import { usd } from "@/lib/pricing/publicTypes";
import { goalPercent } from "@/lib/support/rules";
import { EVENTS, track } from "@/lib/analytics/events";
import "@/styles/support.css";

const monthYear = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "America/Los_Angeles" });

export function BackingPair({ from, proHref = "/gs-pro", supportHref = "/support" }: {
  /** Analytics place name. */
  from: string;
  /** Where the GS Pro button goes (the pricing on /gs-pro, else /gs-pro). */
  proHref?: string;
  /** Where the Support button goes (the form on /support, else /support). */
  supportHref?: string;
}) {
  const availability = usePaidAvailability();
  const who = useTrialEligibility();
  const support = useSupportStatus();
  const pricing = usePublicPricing();
  const pro = pricing.plans.pro ?? { monthly: 9, annual: 99 };

  if (availability && !availability.paidPlans.available) {
    return (
      <Card variant="outlined" padding="large" className="backing-card backing-card--wait">
        <div className="backing-card__tiles" aria-hidden="true">
          <span className="backing-tile"><IconSparkles size={22} stroke={2} /></span>
          <span className="support-tile"><IconHeart size={22} stroke={2} /></span>
        </div>
        <PaidPlansWaitlist product="both" />
      </Card>
    );
  }

  const isPro = !!who?.isPro;
  const trialLeft = !who?.hasUsedTrial;
  const progress = support?.progress;
  return (
    <div className="backing-pair">
      <Card variant="outlined" padding="large" className="backing-card">
        <span className="support-tile" aria-hidden="true"><IconHeart size={22} stroke={2} /></span>
        <h3 className="backing-card__name">Support GameShuffle</h3>
        <p className="backing-card__price backing-card__price--support">
          {support?.supporter && support.since ? `Supporter since ${monthYear(support.since)}` : "From $3, once or monthly. GS Pro included from $9."}
        </p>
        <p className="backing-card__text">
          {support?.supporter
            ? "Thank you for keeping the free games free. You can give again any time."
            : "Keep the free games free and new ones coming. Supporters get a badge, and a spot on the wall if they want one."}
        </p>
        <div className="backing-card__cta">
          <Link href={supportHref} onClick={() => track(EVENTS.supportClicked, { from: `${from}-pair` })}>
            <Button variant="primary">{support?.supporter ? "Give again" : "Support GameShuffle"}</Button>
          </Link>
        </div>
        {progress && (
          <div className="backing-card__goal">
            <span>This month: {goalPercent(progress.raisedCents, progress.goalCents)}% covered</span>
            <Progress value={goalPercent(progress.raisedCents, progress.goalCents)} label="This month's costs covered" />
          </div>
        )}
      </Card>
      <Card variant="outlined" padding="large" className="backing-card">
        <span className="backing-tile" aria-hidden="true"><IconSparkles size={22} stroke={2} /></span>
        <h3 className="backing-card__name">GS Pro</h3>
        <p className="backing-card__price">
          {isPro ? "You have GS Pro" : trialLeft ? `${usd(pro.monthly)} a month · 14 days free` : `${usd(pro.monthly)} a month or ${usd(pro.annual)} a year`}
        </p>
        <p className="backing-card__text">Tools for streamers and hosts: the overlay, chat games, the Discord bot and your own themes.</p>
        <div className="backing-card__cta">
          {isPro
            ? <Link href="/account?tab=plans"><Button variant="secondary">Manage your plan</Button></Link>
            : <Link href={proHref} onClick={() => track(EVENTS.upgradeClicked, { from: `${from}-pair` })}><Button variant="primary">{trialLeft ? "Start 14 days free" : "Get GS Pro"}</Button></Link>}
        </div>
      </Card>
    </div>
  );
}
