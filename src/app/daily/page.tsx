import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { DailiesBar, DailiesProvider } from "@/components/originals/Dailies";
import { DiscordPlug } from "@/components/discord/DiscordPlug";
import { DailyShuffle } from "@/components/originals/DailyShuffle";
import { NewHereLine } from "@/components/welcome/NewHereLine";

export const metadata: Metadata = {
  title: "The Daily Shuffle: guess the Nintendo character",
  description: "A daily character guessing game: one character a day from 130 across Nintendo and Smash's guests. A new hint after every miss, five guesses and a last chance.",
  alternates: { canonical: "https://www.gameshuffle.co/daily" },
};

/** /daily — the Daily Shuffle, a GameShuffle Original. */
export default function DailyPage() {
  return (
    <main>
      <BrowseHero
        eyebrow="A GameShuffle Original · every day"
        title="The Daily Shuffle"
        sub="Guess today's character from 130 across Nintendo, with a new hint after every miss. Same puzzle for everyone, new one every day."
        subShort="Guess today's character from 130 across Nintendo."
        accent="daily"
        field="daily"
        compact
      />
      <Container className="tool-page daily-page">
        <DailiesProvider current="shuffle">
          <DailiesBar current="shuffle" />
          <DailyShuffle />
        </DailiesProvider>
        <NewHereLine from="daily-shuffle" />
        <DiscordPlug from="daily" />
      </Container>
    </main>
  );
}
