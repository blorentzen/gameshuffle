/**
 * The front page's Go further (Britton's picks, 2026-10-16; Support joined 2026-10-19, VDh1QfETVjNTjjzeiKqLNg; three
 * light rows since the front page picks 2026-11-07, 5A, the dark band was 1,286px on a phone). Three rows shown to everyone: Support GameShuffle for
 * anyone who enjoys it (first since the support first plan, same day), GS Pro for streamers and
 * GS Circuit for organizers. Members see their way
 * in instead of the pitch ("Open your hub", "Manage your events"), supporters a thank-you and
 * Give again. Circuit's line follows its launch; GS Pro's follows the trial and the price list;
 * outside the US GS Pro and Support say US only for now (their buttons lead to the waitlist).
 */

import { IconBroadcast, IconHeart, IconTrophy } from "@tabler/icons-react";
import { RowPanel } from "@/components/marketing/RowPanel";
import { EVENTS, tagged } from "@/lib/analytics/events";
import { circuitLaunch } from "@/lib/tournaments/circuit";
import { circuitLaunchState } from "@/lib/tournaments/circuit-resolve";
import { getPublicPricing } from "@/lib/pricing/public";
import { usd } from "@/lib/pricing/publicTypes";

export async function PlansBand({ pro, circuit, trialUsed, supporter, paidHere, supportHere }: {
  pro: boolean;
  circuit: boolean;
  trialUsed: boolean;
  supporter: boolean;
  /** GS Pro can be bought from here (US only for now). */
  paidHere: boolean;
  /** Support can be given from here (everywhere while the support_international switch is on). */
  supportHere: boolean;
}) {
  const [{ launchedAt }, pricing] = await Promise.all([
    circuitLaunchState().catch(() => ({ launchedAt: null })),
    getPublicPricing().catch(() => null),
  ]);
  const launch = circuitLaunch(launchedAt);
  const circuitPrice = launch.phase === "preview" ? "Free while in preview" : launch.phase === "announced" ? `Free until ${launch.dateLabel}` : "From $12 a month";
  const monthly = pricing?.plans.pro?.monthly ?? 9;
  const proPrice = pro ? "You have GS Pro" : !paidHere ? (supportHere ? "Included with Backer support, $9 a month" : "In the US for now") : trialUsed ? `${usd(monthly)} a month` : `${usd(monthly)} a month · 14 days free`;
  const support = supporter ? "Thank you for supporting us." : !supportHere ? "In the US for now." : "Keeps the free games free. From $3; GS Pro included from $9 a month.";
  const proLine = pro ? "You have GS Pro. Your hub has your overlay and chat games." : `Your chat plays along on your overlay, and a Discord bot. ${proPrice}.`;
  const circuitLine = circuit ? "Your events, seasons and settings." : `Bigger fields, seasons, co-organizers and your branding. ${circuitPrice}.`;
  return (
    <section className="front-plans" aria-labelledby="front-plans-title">
      <h2 id="front-plans-title" className="front-plans__title">Go further</h2>
      <RowPanel className="row-panel--surface" rows={[
        { key: "support", Icon: IconHeart, tone: "magenta", title: supporter ? "Thanks for your support" : "Support GameShuffle", titleHref: "/support", titleClassName: tagged(EVENTS.supportClicked, { from: "home" }), text: support },
        { key: "pro", Icon: IconBroadcast, tone: "violet", title: pro ? "Open your hub" : "GS Pro, for streamers", titleHref: pro ? "/hub" : "/gs-pro", titleClassName: pro ? undefined : tagged(EVENTS.upgradeClicked, { from: "home-plans" }), text: proLine },
        { key: "circuit", Icon: IconTrophy, tone: "teal", title: circuit ? "Manage your events" : "GS Circuit, for organizers", titleHref: circuit ? "/account/events?tab=tournaments" : "/gs-circuit", titleClassName: circuit ? undefined : tagged(EVENTS.homeSectionClicked, { to: "circuit" }), text: circuitLine },
      ]} />
    </section>
  );
}
