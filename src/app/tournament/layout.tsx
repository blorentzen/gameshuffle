import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tournaments",
  description: "Browse and join Mario Kart tournaments on GameShuffle. Find open competitions, view brackets, and register to race.",
  openGraph: {
    title: "Mario Kart Tournaments | GameShuffle",
    description: "Browse open Mario Kart tournaments. Find competitions, view live brackets, and register to race.",
    url: "https://gameshuffle.co/tournament",
    images: [
      {
        url: "https://gameshuffle.co/images/opengraph/gs-mk8dx-og.jpg",
        width: 1200,
        height: 630,
        alt: "GameShuffle Tournaments",
      },
    ],
  },
  alternates: {
    canonical: "https://gameshuffle.co/tournament",
  },
};

export default function TournamentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
