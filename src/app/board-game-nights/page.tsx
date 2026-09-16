import Link from "next/link";
import type { Metadata } from "next";
import { Button, Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { listPublicNights } from "@/lib/board-game-nights/store";
import { NightsBrowser, type BrowseNight } from "@/components/board-game-nights/NightsBrowser";
import { SeriesManager } from "@/components/board-game-nights/SeriesManager";
import { listSeries } from "@/lib/board-game-nights/series";
import type { ViewerPrefs } from "@/lib/board-game-nights/match";

export const metadata: Metadata = {
  title: "Board-game nights",
  description: "Find board-game nights near you, or host your own. Set the games, the vibe, and who it's for.",
};

export default async function BoardGameNightsPage() {
  const nights = await listPublicNights();
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

  // Lean, serializable shape for the client browser (distinct game lengths only).
  const browseNights: BrowseNight[] = nights.map((n) => ({
    id: n.id,
    title: n.title,
    place: n.place,
    lat: n.lat,
    lng: n.lng,
    starts_at: n.starts_at,
    timezone: n.timezone,
    genres: n.genres ?? [],
    level: n.level,
    gameCount: n.games.length,
    gameLengths: [...new Set((n.games ?? []).map((g) => g.length).filter(Boolean) as string[])],
    cover: n.cover_image_url ?? null,
  }));

  return (
    <>
      <header className="bgn-hero">
        <Container>
          <div className="bgn-hero__inner">
            <p className="marketing-eyebrow">Game nights, in real life</p>
            <h1 className="bgn-hero__title">Find your table. Bring a game.</h1>
            <p className="bgn-hero__sub">
              Public board-game nights hosted by the community. Set the games, the
              vibe, and who it&apos;s for, then meet players who like what you like.
            </p>
            <div className="bgn-hero__cta">
              <Link href="/board-game-nights/create" style={{ textDecoration: "none" }}>
                <Button variant="primary" size="large">Host a night</Button>
              </Link>
              <Link href="/board-game-nights/tools" style={{ textDecoration: "none" }}>
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

        {nights.length === 0 ? (
          <div className="bgn-empty">
            <p>No public nights yet. Be the first to host one.</p>
            <Link href="/board-game-nights/create" style={{ textDecoration: "none" }}>
              <Button variant="primary">Host a night</Button>
            </Link>
          </div>
        ) : (
          <NightsBrowser nights={browseNights} viewerPrefs={viewerPrefs} />
        )}
        </section>
      </Container>
    </>
  );
}
