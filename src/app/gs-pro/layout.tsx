import type { Metadata } from "next";

/**
 * Server layout solely to attach metadata — the GS Pro page itself is a
 * client component (reuses `useAuth` + the Stripe-checkout
 * `ProUpgradeCtaButtons`), and client components can't export metadata.
 */
export const metadata: Metadata = {
  title: "GameShuffle Pro — sessions, Twitch & Discord integration, and a token economy",
  description:
    "GameShuffle Pro runs your whole game night: cross-platform sessions tying Twitch and Discord together, OBS overlay, chat commands, channel-point rewards, Picks & Bans modules, and a token economy with prediction markets. $9/mo or $99/yr, 14-day free trial.",
  openGraph: {
    title: "GameShuffle Pro",
    url: "https://www.gameshuffle.co/gs-pro",
    images: ["/images/opengraph/gameshuffle-main-og.jpg"],
  },
  alternates: {
    canonical: "https://www.gameshuffle.co/gs-pro",
  },
};

export default function GsProLayout({ children }: { children: React.ReactNode }) {
  return children;
}
