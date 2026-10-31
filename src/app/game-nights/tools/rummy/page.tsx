import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { Rummy } from "@/components/game-nights/companion/Rummy";

export const metadata: Metadata = {
  openGraph: { siteName: "GameShuffle", type: "website", url: "https://www.gameshuffle.co/game-nights/tools/rummy", images: [{ url: "/game-nights/opengraph-image.jpg", width: 1200, height: 630 }] },
  alternates: { canonical: "https://www.gameshuffle.co/game-nights/tools/rummy" },
  title: "Rummy Scorecard: first to the target wins",
  description: "A digital Rummy scorecard: round scoring to a target (500 by default); first past it wins. Free, no account needed.",
};

export default function RummyPage() {
  return (
    <ToolPageShell toolId="rummy">
      <Rummy />
    </ToolPageShell>
  );
}
