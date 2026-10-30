import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { DeductionNotes } from "@/components/game-nights/companion/DeductionNotes";

export const metadata: Metadata = {
  openGraph: { siteName: "GameShuffle", type: "website", url: "https://www.gameshuffle.co/game-nights/tools/deduction", images: [{ url: "/game-nights/opengraph-image.jpg", width: 1200, height: 630 }] },
  alternates: { canonical: "https://www.gameshuffle.co/game-nights/tools/deduction" },
  title: "Clue Notes: digital detective notepad",
  description: "A digital deduction notepad for Clue: mark off suspects, weapons, and rooms per player to crack the case. Free, no account needed.",
};

export default function DeductionPage() {
  return (
    <ToolPageShell toolId="deduction">
      <DeductionNotes />
    </ToolPageShell>
  );
}
