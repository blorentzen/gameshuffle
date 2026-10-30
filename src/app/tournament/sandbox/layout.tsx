import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tournament Sandbox: Try Brackets & Live Scoring",
  description:
    "Play with GameShuffle's tournament modes (single & double-elimination brackets and live points scoring) right in your browser, for any game, no account needed.",
  alternates: { canonical: "https://www.gameshuffle.co/tournament/sandbox" },
  // Its own og:url (the tournaments layout's points at /tournament).
  openGraph: { siteName: "GameShuffle", type: "website", url: "https://www.gameshuffle.co/tournament/sandbox", images: [{ url: "https://cdn.empac.co/gameshuffle/images/opengraph/mk-tournaments-og.jpg", width: 1200, height: 630, alt: "GameShuffle Tournaments" }] },
};

export default function SandboxLayout({ children }: { children: React.ReactNode }) {
  return children;
}
