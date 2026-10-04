import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { DailyShuffle } from "@/components/originals/DailyShuffle";

export const metadata: Metadata = {
  title: "The Daily Shuffle: guess the Mario Kart and Mario Party character",
  description: "A daily character guessing game that rotates through Mario Kart 8 Deluxe, Mario Kart World and Mario Party. Six tries, hints after every guess, a new puzzle every day.",
  alternates: { canonical: "https://www.gameshuffle.co/daily" },
};

/** /daily — the Daily Shuffle, a GameShuffle Original. */
export default function DailyPage() {
  return (
    <main>
      <BrowseHero
        eyebrow="A GameShuffle Original · every day"
        title="The Daily Shuffle"
        sub="Guess today's character in six tries. It rotates through Mario Kart 8 Deluxe, Mario Kart World and Mario Party: same puzzle for everyone, new one every day."
        accent="violet"
        field="daily"
      />
      <Container className="tool-page">
        <DailyShuffle />
      </Container>
    </main>
  );
}
