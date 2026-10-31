import type { Metadata } from "next";

/**
 * Server layout solely to attach metadata — the GS Pro page itself is a
 * client component (reuses `useAuth` + the Stripe-checkout
 * `ProUpgradeCtaButtons`), and client components can't export metadata.
 */
export const metadata: Metadata = {
  title: "GS Pro: chat games, overlays and stream tools",
  description:
    "GS Pro runs your stream's game night: chat rolls for every game, an OBS overlay, polls, Stream Bingo, drafts and AI tools, on Twitch and Discord.",
  openGraph: {
    siteName: "GameShuffle",
    title: "GameShuffle Pro",
    url: "https://www.gameshuffle.co/gs-pro",
    images: ["https://cdn.empac.co/gameshuffle/images/opengraph/gs-pro-og.jpg"],
  },
  alternates: {
    canonical: "https://www.gameshuffle.co/gs-pro",
  },
};

export default function GsProLayout({ children }: { children: React.ReactNode }) {
  return children;
}
