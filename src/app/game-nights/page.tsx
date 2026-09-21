import Link from "next/link";
import type { Metadata } from "next";
import { Button, Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { Suspense } from "react";
import { EventsBrowser } from "@/components/events/EventsBrowser";
import { loadNightRows, loadTournamentRows } from "@/lib/events/browse";
import { SeriesManager } from "@/components/game-nights/SeriesManager";
import { listSeries } from "@/lib/game-nights/series";
import type { ViewerPrefs } from "@/lib/game-nights/match";

export const metadata: Metadata = {
  title: "Game nights",
  description: "Find game nights near you, or host your own. Set the games, the vibe, and who it's for.",
};

export default async function GameNightsPage() {
  const [nights, tournamentRail] = await Promise.all([loadNightRows(), loadTournamentRows(24)]);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const mySeries = user ? await listSeries().catch(() => []) : [];

  // Viewer board-game prefs power the "Best match" sort + "Good match" badges.
  let viewerPrefs: ViewerPrefs | null = null;
  if (user) {
    const { data: prefs } = await supabase
      .from("users")
      .select("plays_board_games, board_game_genres, board_game_level, board_game_lengths")
      .eq("id", user.id)
      .maybeSingle();
    if (prefs?.plays_board_games) {
      viewerPrefs = {
        genres: (prefs.board_game_genres as string[] | null) ?? [],
        level: (prefs.board_game_level as string | null) ?? null,
        lengths: (prefs.board_game_lengths as string[] | null) ?? [],
      };
    }
  }

  return (
    <>
      <header className="bgn-hero">
        <Container>
          <div className="bgn-hero__inner">
            <p className="marketing-eyebrow">Game nights, in real life</p>
            <h1 className="bgn-hero__title">Find your table. Bring a game.</h1>
            <p className="bgn-hero__sub">
              Board games, couch co-op, TCG league nights: public game nights hosted by
              the community. Set the games, the vibe, and who it&apos;s for, then meet
              players who like what you like.
            </p>
            <div className="bgn-hero__cta">
              <Link href="/game-nights/create" style={{ textDecoration: "none" }}>
                <Button variant="primary" size="large">Host a night</Button>
              </Link>
              <Link href="/game-nights/tools" style={{ textDecoration: "none" }}>
                <Button variant="secondary" size="large">Game night tools</Button>
              </Link>
            </div>
          </div>
        </Container>
        <svg className="bgn-hero__curve" viewBox="0 0 1440 72" preserveAspectRatio="none" aria-hidden>
          <path d="M0,72 H1440 V34 C 940,2 520,70 0,30 Z" fill="var(--background-primary)" />
        </svg>
      </header>

      <Container>
        <section id="bgn-list" className="bgn-browse" style={{ margin: "var(--spacing-40) 0 var(--spacing-64)", scrollMarginTop: "6rem" }}>
        {mySeries.length > 0 && (
          <SeriesManager initial={mySeries.map((s) => ({ id: s.id, name: s.name, cadence: s.cadence, active: s.active, nextAt: s.nextAt }))} />
        )}

        <Suspense fallback={null}>
          <EventsBrowser
            events={nights}
            viewerPrefs={viewerPrefs}
            config={{
              type: "game-night",
              heading: "Upcoming nights",
              createHref: "/game-nights/create",
              createLabel: "Host a night",
              searchPlaceholder: "Nights, places, games, hosts",
              emptyText: "No nights match. Widen the filters, or host one yourself.",
              filters: { when: true, kind: true, genre: true, level: true },
              crossRail: {
                heading: "Also happening: tournaments",
                href: "/tournament",
                linkLabel: "Browse tournaments",
                items: tournamentRail.filter((t) => t.phase === "upcoming" || t.phase === "live").slice(0, 4),
              },
            }}
          />
        </Suspense>
        </section>
      </Container>
    </>
  );
}
