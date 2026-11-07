/**
 * /host: the Host home (journeys picks 2026-11-06, 5A to 8A, https://claude.ai/artifact/DqZuBnVSJFAuDSDY4Ssb11), for
 * anyone who has run an event. What needs you comes first (players waiting to be accepted, a tournament still marked
 * as running, one whose date passed without starting, a trivia night left open), each with the one button that fixes
 * it; then what's running, what's coming up across every kind, this month, your leagues and seasons with the top
 * three, and Start something at the foot. Anyone who hasn't run anything yet gets the Host world page.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { redirect } from "next/navigation";
import { hostHome } from "@/lib/host/home";
import { hostViewer } from "@/lib/host/server";
import { HostEventRow, HostHeader, NeedsYouList, RunningCard, SeasonCard, StartSomething } from "@/components/host/HostParts";

export const metadata: Metadata = { title: "Host", robots: { index: false, follow: false } };

const COMING = 6;

const RUNNING_CARDS = 3;

export default async function HostHomePage() {
  const { userId, tz } = await hostViewer("/host");
  const home = await hostHome(userId);
  if (!home.hasRun) redirect("/game-nights");

  const running = home.events.filter((e) => e.stage === "running");
  const coming = home.events
    .filter((e) => e.stage === "coming" || e.stage === "draft")
    .sort((a, b) => (a.stage === "draft" ? 1 : 0) - (b.stage === "draft" ? 1 : 0) || (a.at ? Date.parse(a.at) : Infinity) - (b.at ? Date.parse(b.at) : Infinity));

  return (
    <div className="hub-page studio-page host-page">
      <HostHeader />
      {home.needs.length > 0 && <NeedsYouList needs={home.needs} />}
      {/* The first three running events as cards; the rest are one line away on Events. */}
      {running.slice(0, RUNNING_CARDS).map((e) => <RunningCard key={`${e.kind}-${e.id}`} e={e} tz={tz} />)}
      {running.length > RUNNING_CARDS && (
        <p className="host-more"><ArrowLink href="/host/events">{running.length - RUNNING_CARDS} more running now</ArrowLink></p>
      )}

      <div className="hub-home__row">
        <section className="hub-panel" aria-labelledby="host-coming">
          <div className="hub-panel__head">
            <h2 id="host-coming" className="hub-panel__title">Coming up <span className="hub-page__group-count">{coming.length}</span></h2>
            <Link className="hub-panel__link" href="/host/events">All events</Link>
          </div>
          {coming.length === 0 ? (
            <p className="hub-panel__empty">Nothing planned. Start something below and it shows here.</p>
          ) : (
            <ul className="hub-rows">{coming.slice(0, COMING).map((e) => <HostEventRow key={`${e.kind}-${e.id}`} e={e} tz={tz} action={e.stage === "draft" ? "Continue" : "Manage"} />)}</ul>
          )}
        </section>

        <section className="hub-panel" aria-labelledby="host-month">
          <h2 id="host-month" className="hub-panel__title">This month</h2>
          <div className="hub-stats host-stats">
            <div className="hub-stats__item"><span className="hub-stats__label">Events</span><span className="hub-stats__value">{home.month.events}</span></div>
            <div className="hub-stats__item"><span className="hub-stats__label">Players</span><span className="hub-stats__value">{home.month.players}</span></div>
          </div>
        </section>
      </div>

      {home.seasons.length > 0 && (
        <section className="host-seasons" aria-labelledby="host-seasons">
          <div className="hub-panel__head">
            <h2 id="host-seasons" className="hub-panel__title">Leagues and seasons</h2>
            <Link className="hub-panel__link" href="/host/leagues">All of them</Link>
          </div>
          <div className="host-seasons__grid">{home.seasons.map((s) => <SeasonCard key={s.key} s={s} />)}</div>
        </section>
      )}

      <StartSomething />
    </div>
  );
}
