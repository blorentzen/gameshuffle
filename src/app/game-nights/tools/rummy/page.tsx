import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { Rummy } from "@/components/game-nights/companion/Rummy";

export const metadata: Metadata = {
  title: "Rummy Scorecard — first to the target wins",
  description: "A digital Rummy scorecard: round scoring to a target (500 by default); first past it wins. Free, no account needed.",
};

export default function RummyPage() {
  return (
    <ToolPageShell toolId="rummy">
      <Rummy />
    </ToolPageShell>
  );
}
