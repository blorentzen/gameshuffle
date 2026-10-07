import type { Metadata } from "next";
import { ProToolCta } from "@/components/tools/ProToolCta";
import { FreeToolShell } from "@/components/tools/FreeToolShell";
import { MagicEightBallTool } from "@/components/tools/MagicEightBallTool";
import { IconCircleNumber8 } from "@tabler/icons-react";

export const metadata: Metadata = {
  title: "Magic 8-Ball: free online yes/no answers",
  description:
    "Ask the Magic 8-Ball a yes-or-no question and shake for one of the 20 classic answers. A free online 8-ball. No account required.",
  alternates: { canonical: "https://www.gameshuffle.co/magic-8-ball" },
  openGraph: { title: "Free Online Magic 8-Ball", url: "https://www.gameshuffle.co/magic-8-ball" },
};

export default function MagicEightBallPage() {
  return (
    <main>
      <FreeToolShell icon={IconCircleNumber8} name="Magic 8-Ball" lede="Think of a yes-or-no question, then shake the ball for one of the 20 classic answers.">
        <MagicEightBallTool />
      </FreeToolShell>
      <ProToolCta />
    </main>
  );
}
