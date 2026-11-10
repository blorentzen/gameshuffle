import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { AllDailies } from "@/components/originals/AllDailies";
import { createClient } from "@/lib/supabase/server";
import { dailyPicksState } from "@/lib/originals/dailyPicks";
import { DAILIES_HERO } from "./hero";

export const metadata: Metadata = {
  title: "All dailies: free daily puzzles and games",
  description: "Every daily on GameShuffle in one place: the Daily Shuffle, the Daily Dex, Fire Round and the Daily Duel, plus the Weekly Challenge. New puzzles at midnight Pacific.",
  alternates: { canonical: "https://www.gameshuffle.co/dailies" },
  openGraph: { siteName: "GameShuffle", type: "website", url: "https://www.gameshuffle.co/dailies" },
};

/**
 * /dailies: every daily, yours first (choose your dailies, 2026-11-09). Signed in, the server reads your picks so
 * the first paint has the right sections; today's state fills in from this browser and /api/dailies.
 */
export default async function DailiesPage() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  const state = await dailyPicksState(user?.id ?? null);
  return (
    <main>
      <BrowseHero {...DAILIES_HERO} />
      <Container className="all-dailies">
        <AllDailies initial={{ signedIn: !!user, picks: state.picks, chosen: state.chosen, canChoose: state.canChoose }} />
      </Container>
    </main>
  );
}
