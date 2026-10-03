import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";
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
      <Container className="tool-page">
        <p className="marketing-eyebrow">Daily game</p>
        <h1 className="tool-page__title">The Daily Shuffle</h1>
        <p className="tool-page__lead">Guess today&apos;s character in six tries. The game rotates through Mario Kart 8 Deluxe, Mario Kart World and Mario Party. Same puzzle for everyone, new one every day.</p>
        <DailyShuffle />
      </Container>
    </main>
  );
}
