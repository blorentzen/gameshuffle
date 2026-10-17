/**
 * Homepage: Go further (Britton's picks, 2026-10-16). One dark band with the
 * two paid plans side by side: GS Pro for streamers and GS Circuit for
 * organizers. Members see their way in instead of the pitch ("Open your hub",
 * "Manage your events"). Circuit's line follows its launch: free in preview,
 * then its prices (src/lib/tournaments/circuit.ts).
 */

import Link from "next/link";
import { Button } from "@empac/cascadeds";
import { IconBroadcast, IconTrophy } from "@tabler/icons-react";
import { DarkBand } from "@/components/marketing/DarkBand";
import { EVENTS, tagged } from "@/lib/analytics/events";
import { circuitLaunch } from "@/lib/tournaments/circuit";
import { circuitLaunchState } from "@/lib/tournaments/circuit-resolve";

export async function PlansBand({ pro, circuit }: { pro: boolean; circuit: boolean }) {
  const { launchedAt } = await circuitLaunchState().catch(() => ({ launchedAt: null }));
  const launch = circuitLaunch(launchedAt);
  const circuitPrice = launch.phase === "preview" ? "Free while in preview" : launch.phase === "announced" ? `Free until ${launch.dateLabel}` : "From $12 a month";
  return (
    <DarkBand premium curved className="home-plans">
      <h2 className="home-plans__title">Go further</h2>
      <p className="home-plans__lede">Everything above is free. These add the tools for streams and bigger events.</p>
      <div className="home-plans__grid">
        <div className="home-plan">
          <span className="home-plan__icon" aria-hidden><IconBroadcast size={22} stroke={1.75} /></span>
          <h3 className="home-plan__name">GS Pro <span>for streamers</span></h3>
          <p className="home-plan__price">$9 a month · 14 days free</p>
          <p className="home-plan__text">Your chat plays along: rolls, polls, bingo, trivia and predictions on your overlay, the Discord bot, break mode and your own themes.</p>
          {pro
            ? <Link href="/hub"><Button variant="secondary">Open your hub</Button></Link>
            : <Link href="/gs-pro" className={tagged(EVENTS.upgradeClicked, { from: "home-plans" })}><Button variant="primary">Try GS Pro free</Button></Link>}
        </div>
        <div className="home-plan">
          <span className="home-plan__icon" aria-hidden><IconTrophy size={22} stroke={1.75} /></span>
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
