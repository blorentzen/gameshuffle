import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mario Kart 8 Deluxe Competitive Hub",
  description: "The Mario Kart 8 Deluxe competitive hub. Access tier lists, legal track pools, standard rulesets, lounge scoring, and community resources for MK8DX players.",
  openGraph: {
    title: "MK8DX Competitive Hub | GameShuffle",
    description: "Tier lists, legal track pools, lounge scoring, and community rulesets for competitive Mario Kart 8 Deluxe.",
    url: "https://gameshuffle.co/competitive/mario-kart-8-deluxe",
    images: [
      {
        url: "https://gameshuffle.co/images/opengraph/gs-mk8dx-og.jpg",
        width: 1200,
        height: 630,
        alt: "Mario Kart 8 Deluxe Competitive Hub",
      },
    ],
  },
  alternates: {
    canonical: "https://gameshuffle.co/competitive/mario-kart-8-deluxe",
  },
};

export default function CompetitiveMK8DXLayout({ children }: { children: React.ReactNode }) {
  return children;
}
