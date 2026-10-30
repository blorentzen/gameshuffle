import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { NightPlanner } from "@/components/game-nights/companion/NightPlanner";

export const metadata: Metadata = {
  openGraph: { siteName: "GameShuffle", type: "website", url: "https://www.gameshuffle.co/game-nights/tools/night-planner", images: [{ url: "/game-nights/opengraph-image.jpg", width: 1200, height: 630 }] },
  title: "Game night planner: what should we play tonight?",
  description: "Tell GameShuffle who's coming, how long you have and the games you own, and get a game night lineup you can start on everyone's phones in one tap.",
  alternates: { canonical: "https://www.gameshuffle.co/game-nights/tools/night-planner" },
};

export default function NightPlannerPage() {
  return (
    <ToolPageShell toolId="night-planner">
      <NightPlanner />
    </ToolPageShell>
  );
}
