import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tournament Sandbox: Try Mario Kart Brackets & Scoring",
  description:
    "Play with GameShuffle's Mario Kart tournament modes (single & double-elimination brackets and live points scoring) right in your browser, no account needed.",
  alternates: { canonical: "/tournament/sandbox" },
};

export default function SandboxLayout({ children }: { children: React.ReactNode }) {
  return children;
}
