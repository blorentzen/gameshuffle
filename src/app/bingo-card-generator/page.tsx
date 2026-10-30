import type { Metadata } from "next";
import { ProToolCta } from "@/components/tools/ProToolCta";
import { FreeToolShell } from "@/components/tools/FreeToolShell";
import { BingoCardTool } from "@/components/tools/BingoCardTool";
import { BingoTemplatePicker } from "@/components/tools/BingoTemplatePicker";
import { IconLayoutGrid } from "@tabler/icons-react";

export const metadata: Metadata = {
  title: "Bingo Card Generator: free custom bingo cards",
  description:
    "A free bingo card generator: type your own squares or start from a Twitch, Mario Kart or game night template, then print or play along. No account.",
  alternates: { canonical: "https://www.gameshuffle.co/bingo-card-generator" },
  openGraph: {
    siteName: "GameShuffle",
    title: "Free Bingo Card Generator",
    url: "https://www.gameshuffle.co/bingo-card-generator",
  },
};

export default function BingoCardGeneratorPage() {
  return (
    <main>
      <FreeToolShell icon={IconLayoutGrid} name="Bingo Card Generator" lede={<>A random classic bingo card is ready below. Hit <strong>New card</strong> for another, or switch to <strong>Custom words</strong> to make your own. Print it or click squares to mark them as you play.</>}>
        <BingoCardTool />
        <BingoTemplatePicker />
      </FreeToolShell>
      <ProToolCta />
    </main>
  );
}
