import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Log In",
  description: "Log in to your GameShuffle account to access your saved configurations, tournaments, and competitive tools.",
  openGraph: {
    title: "Log In | GameShuffle",
    description: "Log in to your GameShuffle account.",
    url: "https://gameshuffle.co/login",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
