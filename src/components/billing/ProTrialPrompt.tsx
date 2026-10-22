"use client";

import Link from "next/link";
import { Card } from "@empac/cascadeds";
import { IconLock } from "@tabler/icons-react";
import { IconTile } from "@/components/ui/IconTile";
import { ProUpgradeCtaButtons } from "@/components/account/ProUpgradeCtaButtons";
import { useTrialEligibility } from "@/components/billing/useTrialEligibility";
import { ProTerms } from "@/components/billing/ProTerms";
import { SupportInstead } from "@/components/support/SupportMoment";
import { useToast } from "@/components/toast/ToastProvider";

/**
 * The one "this is GS Pro" moment, used wherever a free account reaches a Pro
 * feature (brand themes, a full My Cards, past seasons, more Discord servers,
 * Twitch). It names what's locked, offers the 14-day trial when the account
 * still has one (the checkout buttons start it), offers Support as the quiet second choice
 * (Britton's pick, 2026-10-19), and links to the full plan.
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
        {/* A square tile: a circle means Energy in the companion (design round 3, 2026-10-20). */}
        <IconTile icon={IconLock} tone="magenta" />
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
      <SupportInstead from={from} />
      <Link href={`/gs-pro?from=${encodeURIComponent(from)}`} className="pro-trial__more">See everything in GS Pro</Link>
    </Card>
  );
}
