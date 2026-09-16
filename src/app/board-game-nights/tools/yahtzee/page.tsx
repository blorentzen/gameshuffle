import type { Metadata } from "next";
import { ToolPageShell } from "@/components/board-game-nights/companion/ToolPageShell";
import { Yahtzee } from "@/components/board-game-nights/companion/Yahtzee";

export const metadata: Metadata = {
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
