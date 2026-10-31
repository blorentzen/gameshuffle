import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { ScorePad } from "@/components/game-nights/companion/ScorePad";

export const metadata: Metadata = {
  openGraph: { siteName: "GameShuffle", type: "website", url: "https://www.gameshuffle.co/game-nights/tools/score-pad", images: [{ url: "/game-nights/opengraph-image.jpg", width: 1200, height: 630 }] },
  alternates: { canonical: "https://www.gameshuffle.co/game-nights/tools/score-pad" },
  title: "Score Pad: track any game's scores",
  description: "A digital score pad for game night: track scores across rounds with running totals. Free, no account needed.",
};

export default function ScorePadPage() {
  return (
    <ToolPageShell toolId="score-pad">
      <ScorePad />
    </ToolPageShell>
  );
}
