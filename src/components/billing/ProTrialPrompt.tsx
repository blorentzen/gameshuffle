"use client";

import Link from "next/link";
import { Card, Icon } from "@empac/cascadeds";
import { ProUpgradeCtaButtons } from "@/components/account/ProUpgradeCtaButtons";
import { useTrialEligibility } from "@/components/billing/useTrialEligibility";
import { ProTerms } from "@/components/billing/ProTerms";
import { useToast } from "@/components/toast/ToastProvider";

/**
 * The one "this is GS Pro" moment, used wherever a free account reaches a Pro
 * feature (brand themes, a full My Cards, past seasons, more Discord servers,
 * Twitch). It names what's locked, offers the 14-day trial when the account
 * still has one (the checkout buttons start it), and links to the full plan.
 * Renders nothing for Pro accounts.
 */
export function ProTrialPrompt({ title, children, from, compact = false }: {
  /** What's locked, as a sentence: "Brand themes are part of GS Pro". */
  title: string;
  /** One or two lines on what they'd get. */
  children?: React.ReactNode;
  /** Analytics place name (Upgrade Clicked `from`). */
  from: string;
  /** Tighter padding for use inside another card. */
  compact?: boolean;
}) {
  const who = useTrialEligibility();
  const toast = useToast();
  if (!who || who.isPro) return null;
  return (
    <Card variant="outlined" padding={compact ? "medium" : "large"} className="pro-trial">
      <div className="pro-trial__head">
        <span className="pro-trial__icon" aria-hidden><Icon name="lock" size="18" /></span>
        <h3 className="pro-trial__title">{title}</h3>
      </div>
      {children && <div className="pro-trial__body">{children}</div>}
      {who.signedIn ? (
        <>
          <ProTerms className="pro-trial__terms" hasUsedTrial={who.hasUsedTrial} />
          <ProUpgradeCtaButtons hasUsedTrial={who.hasUsedTrial} from={from} onError={(m) => toast.error(m)} />
        </>
      ) : (
        <p className="pro-trial__terms"><Link href="/signup?redirect=/account?tab=plans">Create a free account</Link> to start your 14-day GS Pro trial.</p>
      )}
      <Link href={`/gs-pro?from=${encodeURIComponent(from)}`} className="pro-trial__more">See everything in GS Pro</Link>
    </Card>
  );
}
