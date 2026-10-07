import type { Metadata } from "next";
import { ProToolCta } from "@/components/tools/ProToolCta";
import { FreeToolShell } from "@/components/tools/FreeToolShell";
import { TierListTool } from "@/components/tools/TierListTool";
import { TierTemplatePicker } from "@/components/tools/TierTemplatePicker";
import { IconListNumbers } from "@tabler/icons-react";

export const metadata: Metadata = {
  title: "Tier List Maker: free drag-and-drop tier lists",
  description:
    "A free tier list maker. Add items, drag them into S, A, B, C, and D tiers, and rank anything: games, characters, whatever. Saves in your browser. No account required.",
  alternates: { canonical: "https://www.gameshuffle.co/tier-list-maker" },
  openGraph: { title: "Free Tier List Maker", url: "https://www.gameshuffle.co/tier-list-maker" },
};

export default function TierListMakerPage() {
  return (
    <main>
      <FreeToolShell icon={IconListNumbers} name="Tier List Maker" lede="Add items, then drag them into S-D tiers to rank anything. Your list saves in your browser.">
        <TierListTool />
        <TierTemplatePicker />
      </FreeToolShell>
      <ProToolCta />
    </main>
  );
}
