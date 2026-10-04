import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
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
      <BrowseHero
        eyebrow="A GameShuffle Original · every Monday"
        title="The Weekly Challenge"
        sub="One challenge for everyone, new every Monday. Answer this week's question, guess what the crowd said, and see how you stack up when the board is revealed."
        accent="violet"
        field="weekly"
      />
      <Container className="tool-page">
        <WeeklyChallenge />
      </Container>
    </main>
  );
}
