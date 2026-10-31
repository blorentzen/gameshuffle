import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { Werewolf } from "@/components/game-nights/companion/Werewolf";

export const metadata: Metadata = {
  openGraph: { siteName: "GameShuffle", type: "website", url: "https://www.gameshuffle.co/game-nights/tools/werewolf", images: [{ url: "/game-nights/opengraph-image.jpg", width: 1200, height: 630 }] },
  alternates: { canonical: "https://www.gameshuffle.co/game-nights/tools/werewolf" },
  title: "Werewolf Moderator: deal roles & run the game",
  description: "Deal secret Werewolf/Mafia roles by passing the phone, then run the night and day phases. Free, no account needed.",
};

export default function WerewolfPage() {
  return (
    <ToolPageShell toolId="werewolf">
      <Werewolf />
    </ToolPageShell>
  );
}
