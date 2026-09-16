import type { Metadata } from "next";
import { ToolPageShell } from "@/components/board-game-nights/companion/ToolPageShell";
import { Werewolf } from "@/components/board-game-nights/companion/Werewolf";

export const metadata: Metadata = {
  title: "Werewolf Moderator — deal roles & run the game",
  description: "Deal secret Werewolf/Mafia roles by passing the phone, then run the night and day phases. Free, no account needed.",
};

export default function WerewolfPage() {
  return (
    <ToolPageShell toolId="werewolf">
      <Werewolf />
    </ToolPageShell>
  );
}
