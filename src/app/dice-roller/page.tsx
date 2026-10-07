import type { Metadata } from "next";
import { ProToolCta } from "@/components/tools/ProToolCta";
import { FreeToolShell } from "@/components/tools/FreeToolShell";
import { DiceRollerTool } from "@/components/tools/DiceRollerTool";
import { IconDice5 } from "@tabler/icons-react";

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
      <FreeToolShell icon={IconDice5} name="Dice Roller" lede="Roll one to six dice in a tap, for board games, tabletop, decisions, and game nights.">
        <DiceRollerTool />
      </FreeToolShell>
      <ProToolCta />
    </main>
  );
}
