import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { Euchre } from "@/components/game-nights/companion/Euchre";

export const metadata: Metadata = {
  openGraph: { siteName: "GameShuffle", type: "website", url: "https://www.gameshuffle.co/game-nights/tools/euchre", images: [{ url: "/game-nights/opengraph-image.jpg", width: 1200, height: 630 }] },
  alternates: { canonical: "https://www.gameshuffle.co/game-nights/tools/euchre" },
  title: "Euchre Scoreboard: first team to 10",
  description: "A digital Euchre scoreboard: two teams race to 10, with quick scoring for made hands, marches, and going alone. Free, no account needed.",
};

export default function EuchrePage() {
  return (
    <ToolPageShell toolId="euchre">
      <Euchre />
    </ToolPageShell>
  );
}
