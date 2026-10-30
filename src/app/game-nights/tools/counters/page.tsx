import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { Counters } from "@/components/game-nights/companion/Counters";

export const metadata: Metadata = {
  openGraph: { siteName: "GameShuffle", type: "website", url: "https://www.gameshuffle.co/game-nights/tools/counters", images: [{ url: "/game-nights/opengraph-image.jpg", width: 1200, height: 630 }] },
  alternates: { canonical: "https://www.gameshuffle.co/game-nights/tools/counters" },
  title: "Counters: life & score counters for board games",
  description: "Per-player counters for life totals, coins, or points, with quick +/- steps. Free, no account needed.",
};

export default function CountersPage() {
  return (
    <ToolPageShell toolId="counters">
      <Counters />
    </ToolPageShell>
  );
}
