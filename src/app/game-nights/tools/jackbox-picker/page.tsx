import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { JackboxPicker } from "@/components/game-nights/companion/JackboxPicker";

export const metadata: Metadata = {
  openGraph: { siteName: "GameShuffle", type: "website", url: "https://www.gameshuffle.co/game-nights/tools/jackbox-picker", images: [{ url: "/game-nights/opengraph-image.jpg", width: 1200, height: 630 }] },
  title: "Jackbox game picker: which Jackbox game should we play?",
  description: "Pick a Jackbox game from the packs you own that fits your player count, with a family-friendly filter, or roll three and vote. Free, no account.",
  alternates: { canonical: "https://www.gameshuffle.co/game-nights/tools/jackbox-picker" },
};

export default function JackboxPickerPage() {
  return (
    <ToolPageShell toolId="jackbox-picker">
      <JackboxPicker />
    </ToolPageShell>
  );
}
