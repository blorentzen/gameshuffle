import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { JackboxPicker } from "@/components/game-nights/companion/JackboxPicker";

export const metadata: Metadata = {
  title: "Jackbox game picker: which Jackbox game should we play?",
  description: "Pick a Jackbox game from the party packs you own that fits your player count, with a family-friendly filter. Or roll three and let the room or your chat vote. Free, no account needed.",
  alternates: { canonical: "https://www.gameshuffle.co/game-nights/tools/jackbox-picker" },
};

export default function JackboxPickerPage() {
  return (
    <ToolPageShell toolId="jackbox-picker">
      <JackboxPicker />
    </ToolPageShell>
  );
}
