import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { Hearts } from "@/components/game-nights/companion/Hearts";

export const metadata: Metadata = {
  title: "Hearts Scorecard — lowest score wins",
  description: "A digital Hearts scorecard with shoot-the-moon handled for you. Lowest score wins at 100. Free, no account needed.",
};

export default function HeartsPage() {
  return (
    <ToolPageShell toolId="hearts">
      <Hearts />
    </ToolPageShell>
  );
}
