import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description: "GameShuffle Pro is $9/month or $99/year with a 14-day free trial. Standalone randomizers stay free forever. Built for streamers and game-night hosts.",
  openGraph: {
    title: "Pricing | GameShuffle",
    description: "GameShuffle Pro — $9/month or $99/year. 14-day free trial. Standalone randomizers free forever.",
    url: "https://gameshuffle.co/pricing",
  },
  alternates: {
    canonical: "https://gameshuffle.co/pricing",
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
