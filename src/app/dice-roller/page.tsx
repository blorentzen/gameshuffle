import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@empac/cascadeds";
import { ProToolCta } from "@/components/tools/ProToolCta";
import { DiceRollerTool } from "@/components/tools/DiceRollerTool";

export const metadata: Metadata = {
  title: "Dice Roller: roll 1-6 dice online, free",
  description:
    "A free online dice roller. Roll one or many d6 dice in a tap, great for board games, tabletop, decisions, and stream game nights. No account required.",
  alternates: { canonical: "https://www.gameshuffle.co/dice-roller" },
  openGraph: { title: "Free Dice Roller", url: "https://www.gameshuffle.co/dice-roller" },
};

export default function DiceRollerPage() {
  return (
    <main>
      <Container className="tool-page">
        <h1 className="tool-page__title">Dice Roller</h1>
        <p className="tool-page__lead">
          Roll one to six dice in a tap, for board games, tabletop, decisions, and game nights.
        </p>
        <DiceRollerTool />
        <p className="tool-page__lead">
          More free tools on the <Link href="/tools">tools hub</Link>.
        </p>
      </Container>
      <ProToolCta />
    </main>
  );
}
