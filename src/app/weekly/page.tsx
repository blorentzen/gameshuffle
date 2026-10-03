import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";
import { WeeklyChallenge } from "@/components/originals/WeeklyChallenge";

export const metadata: Metadata = {
  title: "The Weekly Challenge: rank it like the crowd",
  description: "A new GameShuffle challenge every Monday: rank six things S to D and score for every one you place where the crowd does, plus one mission for every game night. Public leaderboard.",
  alternates: { canonical: "https://www.gameshuffle.co/weekly" },
};

/** /weekly: the Weekly Challenge, a GameShuffle Original. */
export default function WeeklyPage() {
  return (
    <main>
      <Container className="tool-page">
        <p className="marketing-eyebrow">Weekly game</p>
        <h1 className="tool-page__title">The Weekly Challenge</h1>
        <p className="tool-page__lead">One challenge for everyone, new every Monday. Rank this week&apos;s Tier War, finish the game-night mission, and see how you stack up when the crowd&apos;s ranking is revealed.</p>
        <WeeklyChallenge />
      </Container>
    </main>
  );
}
