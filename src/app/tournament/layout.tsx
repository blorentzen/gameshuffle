import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tournaments",
  description: "Browse and join tournaments on GameShuffle: brackets, points, or the Heat \u2192 Mains ladder, for Mario Kart or any game you name. Find open competitions, view live brackets, and register.",
  openGraph: {
    title: "Tournaments | GameShuffle",
    description: "Browse open tournaments for Mario Kart and any other game. Find competitions, view live brackets, and register.",
    url: "https://www.gameshuffle.co/tournament",
    images: [
      {
        url: "https://cdn.empac.co/gameshuffle/images/opengraph/mk-tournaments-og.jpg",
        width: 1200,
        height: 630,
        alt: "GameShuffle Tournaments",
      },
    ],
  },
  alternates: {
    canonical: "https://www.gameshuffle.co/tournament",
  },
};

export default function TournamentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
