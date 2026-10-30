import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { Yahtzee } from "@/components/game-nights/companion/Yahtzee";

export const metadata: Metadata = {
  openGraph: { siteName: "GameShuffle", type: "website", url: "https://www.gameshuffle.co/game-nights/tools/yahtzee", images: [{ url: "/game-nights/opengraph-image.jpg", width: 1200, height: 630 }] },
  alternates: { canonical: "https://www.gameshuffle.co/game-nights/tools/yahtzee" },
  title: "Yahtzee scorecard",
  description: "A digital Yahtzee scorecard with the upper-section bonus and totals done for you. Free, no account needed.",
};

export default function YahtzeePage() {
  return (
    <ToolPageShell toolId="dice-scorecard">
      <Yahtzee />
    </ToolPageShell>
  );
}
