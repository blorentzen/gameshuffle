import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { TurnTimer } from "@/components/game-nights/companion/TurnTimer";

export const metadata: Metadata = {
  openGraph: { siteName: "GameShuffle", type: "website", url: "https://www.gameshuffle.co/game-nights/tools/turn-timer", images: [{ url: "/game-nights/opengraph-image.jpg", width: 1200, height: 630 }] },
  alternates: { canonical: "https://www.gameshuffle.co/game-nights/tools/turn-timer" },
  title: "Turn Timer: a chess clock for board games",
  description: "A tap-to-pass turn timer for your table. Keep slow turns honest across any number of players. Free, no account needed.",
};

export default function TurnTimerPage() {
  return (
    <ToolPageShell toolId="turn-timer">
      <TurnTimer />
    </ToolPageShell>
  );
}
