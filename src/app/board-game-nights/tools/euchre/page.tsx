import type { Metadata } from "next";
import { ToolPageShell } from "@/components/board-game-nights/companion/ToolPageShell";
import { Euchre } from "@/components/board-game-nights/companion/Euchre";

export const metadata: Metadata = {
  title: "Euchre Scoreboard — first team to 10",
  description: "A digital Euchre scoreboard: two teams race to 10, with quick scoring for made hands, marches, and going alone. Free, no account needed.",
};

export default function EuchrePage() {
  return (
    <ToolPageShell toolId="euchre">
      <Euchre />
    </ToolPageShell>
  );
}
