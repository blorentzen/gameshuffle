import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { GamePicker } from "@/components/game-nights/companion/GamePicker";

export const metadata: Metadata = {
  openGraph: { siteName: "GameShuffle", type: "website", url: "https://www.gameshuffle.co/game-nights/tools/game-picker", images: [{ url: "/game-nights/opengraph-image.jpg", width: 1200, height: 630 }] },
  alternates: { canonical: "https://www.gameshuffle.co/game-nights/tools/game-picker" },
  title: "Game Picker: pick a random board game",
  description: "Can't decide what to play? Randomly pick a game from your pool or a catalog of popular titles. Free, no account needed.",
};

export default function GamePickerPage() {
  return (
    <ToolPageShell toolId="game-picker">
      <GamePicker />
    </ToolPageShell>
  );
}
