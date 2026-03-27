import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Account",
  description: "Join GameShuffle for free. Save your randomizer setups, create tournaments, and unlock competitive tools for Mario Kart and more.",
  openGraph: {
    title: "Create a Free Account | GameShuffle",
    description: "Join GameShuffle free. Save configurations, run tournaments, and access competitive tools.",
    url: "https://gameshuffle.co/signup",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
