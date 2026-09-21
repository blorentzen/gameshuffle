import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { TurnTimer } from "@/components/game-nights/companion/TurnTimer";

export const metadata: Metadata = {
  title: "Turn Timer — a chess clock for board games",
  description: "A tap-to-pass turn timer for your table. Keep slow turns honest across any number of players. Free, no account needed.",
};

export default function TurnTimerPage() {
  return (
    <ToolPageShell toolId="turn-timer">
      <TurnTimer />
    </ToolPageShell>
  );
}
