import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@empac/cascadeds";
import { ProToolCta } from "@/components/tools/ProToolCta";
import { BingoCardTool } from "@/components/tools/BingoCardTool";
import { BingoTemplatePicker } from "@/components/tools/BingoTemplatePicker";

export const metadata: Metadata = {
  title: "Bingo Card Generator — free custom bingo cards",
  description:
    "A free bingo card generator. Type your own squares or start from a Twitch, Mario Kart, or game-night template, then generate a random 5×5 card you can print or play along with. No account required.",
  alternates: { canonical: "https://www.gameshuffle.co/bingo-card-generator" },
  openGraph: {
    title: "Free Bingo Card Generator",
    url: "https://www.gameshuffle.co/bingo-card-generator",
  },
};

export default function BingoCardGeneratorPage() {
  return (
    <main>
      <Container className="tool-page">
        <h1 className="tool-page__title">Bingo Card Generator</h1>
        <p className="tool-page__lead">
          A random classic bingo card is ready below — hit <strong>New card</strong> for another,
          or switch to <strong>Custom words</strong> to make your own. Print it or click squares to
          mark them as you play.
        </p>
        <BingoCardTool />
        <BingoTemplatePicker />
        <ProToolCta />
        <p className="tool-page__lead">
          More free tools on the <Link href="/tools">tools hub</Link>.
        </p>
      </Container>
    </main>
  );
}
