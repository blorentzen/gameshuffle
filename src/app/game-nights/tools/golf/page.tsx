import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { Golf } from "@/components/game-nights/companion/Golf";

export const metadata: Metadata = {
  title: "Golf Card Game Scorecard — lowest score wins",
  description: "A digital scorecard for the card game Golf: add a hole each round, lowest total wins. Free, no account needed.",
};

export default function GolfPage() {
  return (
    <ToolPageShell toolId="golf">
      <Golf />
    </ToolPageShell>
  );
}
