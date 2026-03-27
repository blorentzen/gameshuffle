import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create a Tournament",
  description: "Set up a Mario Kart tournament on GameShuffle. Configure your race settings, track lists, rules, and invite participants.",
  openGraph: {
    title: "Create a Tournament | GameShuffle",
    description: "Set up a Mario Kart tournament. Configure race settings, track lists, and rules.",
    url: "https://gameshuffle.co/tournament/create",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function TournamentCreateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
