import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { ShuffleDice } from "@/components/game-nights/companion/ShuffleDice";

export const metadata: Metadata = {
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
