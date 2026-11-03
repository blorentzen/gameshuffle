import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tournaments",
  description: "Browse and join tournaments on GameShuffle: brackets, points or Heat to Mains, for Mario Kart or any game. Find open events and live brackets.",
  // Restated whole: a page's openGraph replaces the root one, site name included.
  openGraph: {
    siteName: "GameShuffle",
    locale: "en_US",
    type: "website",
    title: "Tournaments",
    description: "Browse open tournaments for Mario Kart and any other game. Find competitions, view live brackets, and register.",
    url: "https://www.gameshuffle.co/tournament",
  },
  alternates: {
    canonical: "https://www.gameshuffle.co/tournament",
  },
};

export default function TournamentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
