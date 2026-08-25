import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@empac/cascadeds";
import { ProToolCta } from "@/components/tools/ProToolCta";
import { CoinFlipTool } from "@/components/tools/CoinFlipTool";

export const metadata: Metadata = {
  title: "Coin Flip: flip a coin online, heads or tails",
  description:
    "A free online coin flip. Heads or tails, settled instantly, for quick decisions, game nights, and streams. Keeps a running tally. No account required.",
  alternates: { canonical: "https://www.gameshuffle.co/coin-flip" },
  openGraph: { title: "Free Coin Flip", url: "https://www.gameshuffle.co/coin-flip" },
};

export default function CoinFlipPage() {
  return (
    <main>
      <Container className="tool-page">
        <h1 className="tool-page__title">Coin Flip</h1>
        <p className="tool-page__lead">Heads or tails, settled instantly, for quick decisions and game nights.</p>
        <CoinFlipTool />
        <p className="tool-page__lead">
          More free tools on the <Link href="/tools">tools hub</Link>.
        </p>
      </Container>
      <ProToolCta />
    </main>
  );
}
