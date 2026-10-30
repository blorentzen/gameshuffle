"use client";

/**
 * Looks walls (Supporter looks picks, 2026-10-29, S5 A): how things look (MMR card looks, profile and
 * community skins, brand themes, custom CSS, dice and coin looks) is unlocked by GS Pro or by support
 * sold with looks. While the $3 Supporter level sells looks (on by default; staff can stop it with the
 * support_supporter_looks switch) and
 * the visitor can give from here, the wall leads with Supporter; otherwise it is the usual GS Pro wall.
 * Copy and controls only: the save routes enforce the same rule on the server (hasLooks).
 */

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@empac/cascadeds";
import { IconHeart, IconPalette } from "@tabler/icons-react";
import { IconTile } from "@/components/ui/IconTile";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { ProTrialPrompt } from "@/components/billing/ProTrialPrompt";
import { useTrialEligibility } from "@/components/billing/useTrialEligibility";
import { useSupportLookup } from "@/components/support/useSupportStatus";
import { track, EVENTS } from "@/lib/analytics/events";
import { supportLevel } from "@/lib/support/rules";

export interface LooksAccess {
  signedIn: boolean;
  /** May use looks now. */
  looks: boolean;
  /** The $3 Supporter level sells looks and this visitor can give from here. */
  supporterOffer: boolean;
}

/** Who may use looks. Null while checking. */
export function useLooks(): LooksAccess | null {
  const who = useTrialEligibility();
  const { status, done } = useSupportLookup();
  if (!who) return null;
  if (who.isPro) return { signedIn: who.signedIn, looks: true, supporterOffer: false };
  if (!done) return null;
  return {
    signedIn: who.signedIn,
    looks: !!status?.looks,
    supporterOffer: !!status?.supporterLooks && !!status?.available && !status?.supporter,
  };
}

/** Shows `children` to anyone with looks and `fallback` to everyone else; nothing while checking. */
export function LooksOnly({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const access = useLooks();
  if (!access) return null;
  return <>{access.looks ? children : fallback}</>;
}

/** The short name of what unlocks looks, for help lines and tags. */
export function looksName(access: LooksAccess | null): string {
  return access?.supporterOffer ? "Supporter looks" : "GS Pro";
}

const SUPPORTER_PRICE = `$${(supportLevel("supporter")?.cents ?? 300) / 100}`;

/** The wall in front of a look. `what` names it as a sentence subject: "Brand themes, skins and custom CSS". */
export function LooksPrompt({ what, plural = true, children, from, compact = false }: {
  what: string;
  plural?: boolean;
  children?: ReactNode;
  /** Analytics place name. */
  from: string;
  compact?: boolean;
}) {
  const access = useLooks();
  const router = useRouter();
  if (!access || access.looks) return null;
  if (!access.supporterOffer) {
    return <ProTrialPrompt title={`${what} ${plural ? "are" : "is"} part of GS Pro`} from={from} compact={compact}>{children}</ProTrialPrompt>;
  }
  const go = () => {
    track(EVENTS.supportClicked, { from: `looks-${from}` });
    router.push(`/support?level=supporter&from=${encodeURIComponent(`looks-${from}`)}#give`);
  };
  return (
    <Card variant="outlined" padding={compact ? "medium" : "large"} className="pro-trial looks-prompt">
      <div className="pro-trial__head">
        <IconTile icon={IconPalette} tone="magenta" />
        <h3 className="pro-trial__title">{what} {plural ? "come" : "comes"} with Supporter looks</h3>
      </div>
      {children && <div className="pro-trial__body">{children}</div>}
      <div className="pro-trial__act">
        <div className="looks-prompt__actions">
          <Button variant="primary" iconBefore={IconHeart} onClick={go}>Support for {SUPPORTER_PRICE} a month</Button>
          <ArrowLink href={`/gs-pro?from=${encodeURIComponent(`looks-${from}`)}#included`} className="pro-trial__more">See what&apos;s included</ArrowLink>
        </div>
        <p className="pro-trial__terms">Plus tax. GS Pro includes every look too.</p>
      </div>
    </Card>
  );
}
