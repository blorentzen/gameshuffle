import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { GamePicker } from "@/components/game-nights/companion/GamePicker";

export const metadata: Metadata = {
  title: "Game Picker — pick a random board game",
  description: "Can't decide what to play? Randomly pick a game from your pool or a catalog of popular titles. Free, no account needed.",
};

export default function GamePickerPage() {
  return (
    <ToolPageShell toolId="game-picker">
      <GamePicker />
    </ToolPageShell>
  );
}
