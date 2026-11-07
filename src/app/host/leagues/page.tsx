/** /host/leagues: your trivia leagues (with the top three) and championship seasons, running ones first. */

import type { Metadata } from "next";
import { hostSeasons } from "@/lib/host/home";
import { hostViewer } from "@/lib/host/server";
import { HostHeader, SeasonCard } from "@/components/host/HostParts";
import { ArrowLink } from "@/components/ui/ArrowLink";

export const metadata: Metadata = { title: "Leagues and seasons · Host", robots: { index: false, follow: false } };

export default async function HostLeaguesPage() {
  const { userId } = await hostViewer("/host/leagues");
  const seasons = await hostSeasons(userId);
  const running = seasons.filter((s) => !s.done);
  const done = seasons.filter((s) => s.done);
  return (
    <div className="hub-page studio-page host-page">
      <HostHeader />
      {seasons.length === 0 ? (
        <section className="host-group" aria-labelledby="host-lg-none">
          <h2 id="host-lg-none" className="hub-panel__title">No leagues or seasons yet</h2>
          <p className="host-group__note">A trivia league runs a night a week with standings across the season. A championship season strings tournaments together with season points.</p>
          <p className="host-links"><ArrowLink href="/trivia/leagues/new">Start a trivia league</ArrowLink><ArrowLink href="/tournament/create">Start a championship season</ArrowLink></p>
        </section>
      ) : (
        <>
          {running.length > 0 && (
            <section className="host-seasons" aria-labelledby="host-lg-on">
              <h2 id="host-lg-on" className="hub-panel__title">Running <span className="hub-page__group-count">{running.length}</span></h2>
              <div className="host-seasons__grid">{running.map((s) => <SeasonCard key={s.key} s={s} />)}</div>
            </section>
          )}
          {done.length > 0 && (
            <section className="host-seasons" aria-labelledby="host-lg-done">
              <h2 id="host-lg-done" className="hub-panel__title">Finished <span className="hub-page__group-count">{done.length}</span></h2>
              <div className="host-seasons__grid">{done.map((s) => <SeasonCard key={s.key} s={s} />)}</div>
            </section>
          )}
          <p className="host-links"><ArrowLink href="/trivia/leagues/new">Start a trivia league</ArrowLink><ArrowLink href="/tournament/create">Start a championship season</ArrowLink></p>
        </>
      )}
    </div>
  );
}
