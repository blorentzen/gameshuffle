import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { canStartLeague, leaguesReady } from "@/lib/trivia/leagues";
import { LeagueCreateForm } from "@/components/trivia/leagues/LeagueCreateForm";
import "@/styles/trivia.css";

export const metadata: Metadata = { title: "Start a trivia league", robots: { index: false, follow: false } };

export default async function NewLeaguePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent("/trivia/leagues/new")}`);
  const [ready, allowed] = await Promise.all([leaguesReady(), canStartLeague(user.id)]);

  return (
    <main className="trivia-page">
      <div className="trivia-page__body league-page">
        <div>
          <p className="trivia-label"><Link href="/trivia">Trivia nights</Link> › Start a league</p>
          <h1 className="trivia-h2 league-page__title">Start a trivia league</h1>
          <p className="trivia-muted">A season of weekly trivia nights with standings that build up and teams that come back. Each week is a normal trivia night; finishing it adds to the league.</p>
        </div>
        {!ready ? (
          <div className="trivia-card"><p className="trivia-muted">Leagues need a quick update on our side before they can start.</p></div>
        ) : !allowed ? (
          <div className="trivia-card league-lock">
            <h2 className="trivia-h3">Leagues are part of GS Circuit</h2>
            <p className="trivia-muted">A season of weekly nights with standings, returning teams and a public league page. Circuit 64 is $12 a month. Any single trivia night stays free to host.</p>
            <div className="trivia-row">
              <Link href="/gs-circuit"><Button variant="primary">See the plans</Button></Link>
              <Link href="/trivia"><Button variant="ghost">Host one night instead</Button></Link>
            </div>
          </div>
        ) : (
          <LeagueCreateForm />
        )}
      </div>
    </main>
  );
}
