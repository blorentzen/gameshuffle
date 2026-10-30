import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { OddOneOut } from "@/components/game-nights/companion/OddOneOut";

export const metadata: Metadata = {
  openGraph: { siteName: "GameShuffle", type: "website", url: "https://www.gameshuffle.co/game-nights/tools/odd-one-out", images: [{ url: "/game-nights/opengraph-image.jpg", width: 1200, height: 630 }] },
  title: "Odd One Out: a free party word game for your phone",
  description: "Everyone gets the same secret word except one player. Give one-word hints, vote, and catch the faker. Free, pass-the-phone, no account needed.",
  alternates: { canonical: "https://www.gameshuffle.co/game-nights/tools/odd-one-out" },
};

export default function OddOneOutPage() {
  return (
    <ToolPageShell toolId="odd-one-out">
      <OddOneOut />
    </ToolPageShell>
  );
}
