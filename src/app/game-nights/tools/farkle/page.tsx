import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { Farkle } from "@/components/game-nights/companion/Farkle";

export const metadata: Metadata = {
  title: "Farkle Scoreboard — race to 10,000",
  description: "A digital Farkle scoreboard: bank each turn and race to the target, with the final round called for you. Free, no account needed.",
};

export default function FarklePage() {
  return (
    <ToolPageShell toolId="farkle">
      <Farkle />
    </ToolPageShell>
  );
}
