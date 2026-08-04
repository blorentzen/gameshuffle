import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@empac/cascadeds";
import { ProToolCta } from "@/components/tools/ProToolCta";
import { TierListTool } from "@/components/tools/TierListTool";
import { TierTemplatePicker } from "@/components/tools/TierTemplatePicker";

export const metadata: Metadata = {
  title: "Tier List Maker — free drag-and-drop tier lists",
  description:
    "A free tier list maker. Add items, drag them into S, A, B, C, and D tiers, and rank anything — games, characters, whatever. Saves in your browser. No account required.",
  alternates: { canonical: "https://www.gameshuffle.co/tier-list-maker" },
  openGraph: { title: "Free Tier List Maker", url: "https://www.gameshuffle.co/tier-list-maker" },
};

export default function TierListMakerPage() {
  return (
    <main>
      <Container className="tool-page">
        <h1 className="tool-page__title">Tier List Maker</h1>
        <p className="tool-page__lead">
          Add items, then drag them into S–D tiers to rank anything. Your list saves in your browser.
        </p>
        <TierListTool />
        <TierTemplatePicker />
        <ProToolCta />
        <p className="tool-page__lead">
          More free tools on the <Link href="/tools">tools hub</Link>.
        </p>
      </Container>
    </main>
  );
}
