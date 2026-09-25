import { Suspense } from "react";
import { Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { isEmailVerified } from "@/lib/auth-utils";
import { BetaBanner } from "@/components/BetaBanner";
import { EventsBrowser } from "@/components/events/EventsBrowser";
import { BrowseHero } from "@/components/events/BrowseHero";
import { loadNightRows, loadTournamentRows } from "@/lib/events/browse";

/**
 * Tournament hub. Server-rendered on the shared EventsBrowser (same card,
 * filters, geosearch and URL-state as /game-nights) so the list is crawlable
 * and a filtered view is a link. The URL stays canonical: this page is the
 * "compete" intent; /game-nights is "hang out". Each cross-links the other.
 */
export default async function TournamentBrowsePage() {
  const [tournaments, nightRail] = await Promise.all([loadTournamentRows(), loadNightRows(24)]);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const canCreate = !!user && isEmailVerified(user);

  return (
    <>
      <BrowseHero
        eyebrow="Compete"
        title="Run the bracket. Settle it on track."
        sub={<>One-off tournaments and full championship seasons: brackets, points, or the Heat &rarr; Mains ladder. Randomized rounds nobody can argue with, live scoring, and a season table that keeps itself.</>}
        accent="cyan"
        field="compete"
        primary={canCreate ? { href: "/tournament/create", label: "Create a tournament" } : { href: "/signup", label: "Create a tournament" }}
        secondary={{ href: "/tournament/sandbox", label: "Try the demo" }}
      />

      <Container>
        <section className="bgn-browse" style={{ margin: "var(--spacing-40) 0 var(--spacing-64)" }}>
        <BetaBanner />

        <Suspense fallback={null}>
          <EventsBrowser
            events={tournaments}
            config={{
              type: "tournament",
              heading: "Tournaments",
              createHref: canCreate ? "/tournament/create" : null,
              createLabel: "Create tournament",
              searchPlaceholder: "Tournaments, games, organizers",
              emptyText: "No tournaments match. Try Everything under When, or widen the filters.",
              // Status tabs replace When here: Registration is upcoming and
              // Completed is past by definition, so offering both would let a
              // viewer pick a contradictory pair.
              statusTabs: true,
              filters: { when: false, game: true, online: true },
              crossRail: {
                heading: "Also happening: game nights",
                href: "/game-nights",
                linkLabel: "Browse game nights",
                items: nightRail.filter((n) => n.phase === "upcoming").slice(0, 4),
              },
            }}
          />
        </Suspense>
        </section>
      </Container>
    </>
  );
}
