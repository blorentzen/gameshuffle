import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { Farkle } from "@/components/game-nights/companion/Farkle";

export const metadata: Metadata = {
  openGraph: { siteName: "GameShuffle", type: "website", url: "https://www.gameshuffle.co/game-nights/tools/farkle", images: [{ url: "/game-nights/opengraph-image.jpg", width: 1200, height: 630 }] },
  alternates: { canonical: "https://www.gameshuffle.co/game-nights/tools/farkle" },
  title: "Farkle Scoreboard: race to 10,000",
  description: "A digital Farkle scoreboard: bank each turn and race to the target, with the final round called for you. Free, no account needed.",
};

export default function FarklePage() {
  return (
    <ToolPageShell toolId="farkle">
      <Farkle />
    </ToolPageShell>
  );
}
