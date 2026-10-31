/**
 * Homepage: Go further (Britton's picks, 2026-10-16; Support joined 2026-10-19,
 * VDh1QfETVjNTjjzeiKqLNg). One dark band, three rows shown to everyone: Support GameShuffle for
 * anyone who enjoys it (first since the support first plan, same day), GS Pro for streamers and
 * GS Circuit for organizers. Members see their way
 * in instead of the pitch ("Open your hub", "Manage your events"), supporters a thank-you and
 * Give again. Circuit's line follows its launch; GS Pro's follows the trial and the price list;
 * outside the US GS Pro and Support say US only for now (their buttons lead to the waitlist).
 */

import Link from "next/link";
import { Button } from "@empac/cascadeds";
import { IconBroadcast, IconHeart, IconTrophy } from "@tabler/icons-react";
import { DarkBand } from "@/components/marketing/DarkBand";
import { IconTile } from "@/components/ui/IconTile";
import { EVENTS, tagged } from "@/lib/analytics/events";
import { circuitLaunch } from "@/lib/tournaments/circuit";
import { circuitLaunchState } from "@/lib/tournaments/circuit-resolve";
import { getPublicPricing } from "@/lib/pricing/public";
import { usd } from "@/lib/pricing/publicTypes";

export async function PlansBand({ pro, circuit, trialUsed, supporter, paidHere }: {
  pro: boolean;
  circuit: boolean;
  trialUsed: boolean;
  supporter: boolean;
  /** GS Pro and Support can be bought or given from here (US only for now). */
  paidHere: boolean;
}) {
  const [{ launchedAt }, pricing] = await Promise.all([
    circuitLaunchState().catch(() => ({ launchedAt: null })),
    getPublicPricing().catch(() => null),
  ]);
  const launch = circuitLaunch(launchedAt);
  const circuitPrice = launch.phase === "preview" ? "Free while in preview" : launch.phase === "announced" ? `Free until ${launch.dateLabel}` : "From $12 a month";
  const monthly = pricing?.plans.pro?.monthly ?? 9;
  const proPrice = pro ? "You have GS Pro" : !paidHere ? "In the US for now" : trialUsed ? `${usd(monthly)} a month` : `${usd(monthly)} a month · 14 days free`;
  return (
    <DarkBand premium curved className="home-plans">
      <h2 className="home-plans__title">Go further</h2>
      <p className="home-plans__lede">Everything above is free. Support it to keep it that way, or add tools for streams and bigger events.</p>
      <div className="home-plans__grid">
        <div className="home-plan home-plan--support">
          <IconTile icon={IconHeart} className="home-plan__icon--support" />
          <h3 className="home-plan__name">Support GameShuffle <span>for everyone</span></h3>
          <p className="home-plan__price">{supporter ? "Thank you for supporting us" : !paidHere ? "In the US for now" : "From $3 · GS Pro included from $9"}</p>
          <p className="home-plan__text">No ads, built independently. Support keeps the free games free and new ones coming. You get the Supporter badge, and GS Pro when you back at $9 a month.</p>
          <Link href="/support" className={tagged(EVENTS.supportClicked, { from: "home" })}>
            <Button variant="primary">{supporter ? "Give again" : "Support GameShuffle"}</Button>
          </Link>
        </div>
        <div className="home-plan">
          <IconTile icon={IconBroadcast} tone="magenta" />
          <h3 className="home-plan__name">GS Pro <span>for streamers</span></h3>
          <p className="home-plan__price">{proPrice}</p>
          <p className="home-plan__text">Your chat plays along: rolls, polls, bingo, trivia and predictions on your overlay, the Discord bot, break mode and your own themes.</p>
          {pro
            ? <Link href="/hub"><Button variant="secondary">Open your hub</Button></Link>
            : <Link href="/gs-pro" className={tagged(EVENTS.upgradeClicked, { from: "home-plans" })}><Button variant="secondary">{!paidHere ? "See GS Pro" : trialUsed ? "Get GS Pro" : "Try GS Pro free"}</Button></Link>}
        </div>
        <div className="home-plan">
          <IconTile icon={IconTrophy} tone="teal" />
          <h3 className="home-plan__name">GS Circuit <span>for organizers</span></h3>
          <p className="home-plan__price">{circuitPrice}</p>
          <p className="home-plan__text">Fields of 64 or 256, championship seasons, co-organizers, your branding, text reminders and live randomized rounds.</p>
          {circuit
            ? <Link href="/account/stuff?tab=tournaments"><Button variant="secondary">Manage your events</Button></Link>
            : <Link href="/gs-circuit" className={tagged(EVENTS.homeSectionClicked, { to: "circuit" })}><Button variant="secondary">See GS Circuit</Button></Link>}
        </div>
      </div>
    </DarkBand>
  );
}
