import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { GauntletBuilder } from "@/components/game-nights/companion/GauntletBuilder";

export const metadata: Metadata = {
  title: "The Gauntlet: a game night decathlon with one champion",
  description: "String 4 to 8 games into one competition: Mario Kart, Mario Party and phone party games on a single scoreboard. Everyone plays on their phone; the TV crowns the champion.",
  alternates: { canonical: "https://www.gameshuffle.co/game-nights/tools/the-gauntlet" },
};

export default function GauntletPage() {
  return (
    <ToolPageShell toolId="the-gauntlet">
      <GauntletBuilder />
    </ToolPageShell>
  );
}
