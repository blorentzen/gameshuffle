import type { Metadata } from "next";
import { ProToolCta } from "@/components/tools/ProToolCta";
import { FreeToolShell } from "@/components/tools/FreeToolShell";
import { CoinFlipTool } from "@/components/tools/CoinFlipTool";
import { IconCoin } from "@tabler/icons-react";

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
      <FreeToolShell icon={IconCoin} name="Coin Flip" lede="Heads or tails, settled instantly, for quick decisions and game nights.">
        <CoinFlipTool />
      </FreeToolShell>
      <ProToolCta />
    </main>
  );
}
