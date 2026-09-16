import type { Metadata } from "next";
import { ToolPageShell } from "@/components/board-game-nights/companion/ToolPageShell";
import { Counters } from "@/components/board-game-nights/companion/Counters";

export const metadata: Metadata = {
  title: "Counters — life & score counters for board games",
  description: "Per-player counters for life totals, coins, or points, with quick +/- steps. Free, no account needed.",
};

export default function CountersPage() {
  return (
    <ToolPageShell toolId="counters">
      <Counters />
    </ToolPageShell>
  );
}
