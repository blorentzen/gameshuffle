import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";
import { DailyShuffle } from "@/components/originals/DailyShuffle";

export const metadata: Metadata = {
  title: "The Daily Shuffle: guess the Mario Kart character",
  description: "A daily Mario Kart 8 Deluxe guessing game: six tries to find today's character from weight class, group and A to Z hints. New puzzle every day.",
  alternates: { canonical: "https://www.gameshuffle.co/daily" },
};

/** /daily — the Daily Shuffle, a GameShuffle Original. */
export default function DailyPage() {
  return (
    <main>
      <Container className="tool-page">
        <p className="marketing-eyebrow">Daily game</p>
        <h1 className="tool-page__title">The Daily Shuffle</h1>
        <p className="tool-page__lead">Guess today&apos;s Mario Kart 8 Deluxe character in six tries. Same puzzle for everyone, new one every day.</p>
        <DailyShuffle />
      </Container>
    </main>
  );
}
