import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { MostLikelyTo } from "@/components/game-nights/companion/MostLikelyTo";

export const metadata: Metadata = {
  title: "Most Likely To: free party game prompts",
  description: "Friendly Most Likely To prompts for game night: read one out, count to three, everyone points. Free, no account needed, or play on everyone's phones.",
  alternates: { canonical: "https://www.gameshuffle.co/game-nights/tools/most-likely-to" },
};

export default function MostLikelyToPage() {
  return (
    <ToolPageShell toolId="most-likely-to">
      <MostLikelyTo />
    </ToolPageShell>
  );
}
