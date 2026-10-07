import type { Metadata } from "next";

/**
 * Server layout solely to attach metadata — the GS Pro page itself is a
 * client component (reuses `useAuth` + the Stripe-checkout
 * `ProUpgradeCtaButtons`), and client components can't export metadata.
 */
export const metadata: Metadata = {
  title: "GameShuffle Pro: chat rolls, stream tools and a token economy for streamers",
  description:
    "GameShuffle Pro runs your stream's game night: chat rolls and match rolls for every game, an OBS overlay, live polls, Stream Bingo, Chat Draft, AI tools, channel-point rewards and a token economy with prediction markets, across Twitch and Discord. $9/mo or $99/yr, 14-day free trial.",
  openGraph: {
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
