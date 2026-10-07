import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { DiscordPlug } from "@/components/discord/DiscordPlug";
import { WeeklyChallenge } from "@/components/originals/WeeklyChallenge";

export const metadata: Metadata = {
  title: "The Weekly Challenge: guess what the crowd said",
  description: "A new GameShuffle challenge every Monday: answer the week's question, guess the crowd's top three answers, and score when the board is revealed. Plus one mission for every game night and a public leaderboard.",
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
        <DiscordPlug from="weekly" />
      </Container>
    </main>
  );
}
