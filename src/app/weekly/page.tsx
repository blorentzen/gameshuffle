import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { DailiesBar, DailiesProvider } from "@/components/originals/Dailies";
import { DiscordPlug } from "@/components/discord/DiscordPlug";
import { WeeklyChallenge } from "@/components/originals/WeeklyChallenge";

export const metadata: Metadata = {
  openGraph: { siteName: "GameShuffle", type: "website", url: "https://www.gameshuffle.co/weekly" },
  title: "The Weekly Challenge: guess what the crowd said",
  description: "A new challenge every Monday: answer the week's question, guess the crowd's top three answers and score when the board is revealed.",
  alternates: { canonical: "https://www.gameshuffle.co/weekly" },
};

/** /weekly: the Weekly Challenge, a GameShuffle Original. */
export default function WeeklyPage() {
  return (
    <main>
      <BrowseHero
        eyebrow="A GameShuffle Original"
        title="The Weekly Challenge"
        sub="A new question every Monday. The crowd's answers are revealed the Monday after."
        accent="weekly"
        field="weekly"
      />
      <Container className="tool-page">
        <DailiesProvider current="weekly">
          <DailiesBar current="weekly" />
          <WeeklyChallenge />
        </DailiesProvider>
        <DiscordPlug from="weekly" />
      </Container>
    </main>
  );
}
