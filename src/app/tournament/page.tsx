import Link from "next/link";
import { Suspense } from "react";
import { Container, Button } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { isEmailVerified } from "@/lib/auth-utils";
import { BetaBanner } from "@/components/BetaBanner";
import { EventsBrowser } from "@/components/events/EventsBrowser";
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
    <main style={{ paddingTop: "3rem", paddingBottom: "5rem" }}>
      <Container>
        <BetaBanner />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap", marginBottom: "2rem" }}>
          <div>
            <h1 style={{ fontSize: "2.4rem", fontWeight: 700 }}>Tournaments &amp; Championships</h1>
            <p style={{ color: "var(--text-tertiary)", marginTop: "0.35rem", maxWidth: 560 }}>
              Run a one-off tournament (brackets, points, or the Heat → Mains ladder) or a championship series where points carry across events into a season table.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <Link href="/tournament/sandbox" style={{ textDecoration: "none" }}>
              <Button variant="secondary">Try the demo</Button>
            </Link>
            {canCreate && (
              <Link href="/tournament/create" style={{ textDecoration: "none" }}>
                <Button variant="primary">Create Tournament</Button>
              </Link>
            )}
          </div>
        </div>

        <Suspense fallback={null}>
          <EventsBrowser
            events={tournaments}
            config={{
              type: "tournament",
              heading: "Upcoming tournaments",
              createHref: canCreate ? "/tournament/create" : null,
              createLabel: "Create tournament",
              searchPlaceholder: "Tournaments, games, organizers",
              emptyText: "No tournaments match. Try Everything under When, or widen the filters.",
              filters: { when: true, game: true, online: true },
              crossRail: {
                heading: "Also happening: game nights",
                href: "/game-nights",
                linkLabel: "Browse game nights",
                items: nightRail.filter((n) => n.phase === "upcoming").slice(0, 4),
              },
            }}
          />
        </Suspense>
      </Container>
    </main>
  );
}
