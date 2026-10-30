import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { ShuffleDice } from "@/components/game-nights/companion/ShuffleDice";

export const metadata: Metadata = {
  openGraph: { siteName: "GameShuffle", type: "website", url: "https://www.gameshuffle.co/game-nights/tools/shuffle-dice", images: [{ url: "/game-nights/opengraph-image.jpg", width: 1200, height: 630 }] },
  alternates: { canonical: "https://www.gameshuffle.co/game-nights/tools/shuffle-dice" },
  title: "Shuffle Dice: a push-your-luck dice game (prototype)",
  description: "Our push-your-luck dice game in playtesting: keep Stars and Coins, re-roll the rest, and bank before the third Bomb. Free, one device.",
  robots: { index: false, follow: true },
};

export default function ShuffleDicePage() {
  return (
    <ToolPageShell toolId="shuffle-dice">
      <ShuffleDice />
    </ToolPageShell>
  );
}
