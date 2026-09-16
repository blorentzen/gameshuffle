import type { Metadata } from "next";
import { ToolPageShell } from "@/components/board-game-nights/companion/ToolPageShell";
import { DeductionNotes } from "@/components/board-game-nights/companion/DeductionNotes";

export const metadata: Metadata = {
  title: "Clue Notes — digital detective notepad",
  description: "A digital deduction notepad for Clue: mark off suspects, weapons, and rooms per player to crack the case. Free, no account needed.",
};

export default function DeductionPage() {
  return (
    <ToolPageShell toolId="deduction">
      <DeductionNotes />
    </ToolPageShell>
  );
}
