import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { ChaosCupBuilder } from "@/components/game-nights/companion/ChaosCupBuilder";

export const metadata: Metadata = {
  title: "Chaos Cup: a Mario Kart cup with a twist every race",
  description: "Run a Mario Kart cup where every race gets a modifier: item rules, Mirror or 200cc, and handicaps for the leader. Let your stream chat vote on each one.",
  alternates: { canonical: "https://www.gameshuffle.co/game-nights/tools/chaos-cup" },
};

export default function ChaosCupPage() {
  return (
    <ToolPageShell toolId="chaos-cup">
      <ChaosCupBuilder />
    </ToolPageShell>
  );
}
