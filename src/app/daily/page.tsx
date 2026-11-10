import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { DAILY_HERO } from "./hero";
import { DailiesBar, DailiesProvider } from "@/components/originals/Dailies";
import { DiscordPlug } from "@/components/discord/DiscordPlug";
import { DailyShuffle } from "@/components/originals/DailyShuffle";

export const metadata: Metadata = {
  openGraph: { siteName: "GameShuffle", type: "website", url: "https://www.gameshuffle.co/daily" },
  title: "The Daily Shuffle: guess the Nintendo character",
  description: "A daily character guessing game: one character a day from 130 across Nintendo and Smash's guests. A new hint after every miss, five guesses and a last chance.",
  alternates: { canonical: "https://www.gameshuffle.co/daily" },
};

/** /daily — the Daily Shuffle, a GameShuffle Original. */
export default function DailyPage() {
  return (
    <main>
      <BrowseHero {...DAILY_HERO} />
      <Container className="tool-page daily-page">
        <DailiesProvider current="shuffle">
          <DailiesBar current="shuffle" />
          <DailyShuffle />
        </DailiesProvider>
        <DiscordPlug from="daily" />
      </Container>
    </main>
  );
}
