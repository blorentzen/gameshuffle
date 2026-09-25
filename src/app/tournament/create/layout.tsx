import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create a Tournament",
  description: "Set up a tournament on GameShuffle. Pick a bracket, points or Heat \u2192 Mains, bring Mario Kart or name your own game, write the rules, and invite participants.",
  openGraph: {
    title: "Create a Tournament | GameShuffle",
    description: "Set up a tournament for any game. Pick a format, write the rules, invite participants.",
    url: "https://www.gameshuffle.co/tournament/create",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function TournamentCreateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
