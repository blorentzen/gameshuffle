import type { Metadata } from "next";
import { ProToolCta } from "@/components/tools/ProToolCta";
import { FreeToolShell } from "@/components/tools/FreeToolShell";
import { YesNoTool } from "@/components/tools/YesNoTool";
import { IconArrowsSplit } from "@tabler/icons-react";

export const metadata: Metadata = {
  title: "Yes or No: free random decision maker",
  description:
    "Can't decide? Hit the button for a random Yes or No (add Maybe if you like). A free yes-or-no decision maker with a running tally. No account required.",
  alternates: { canonical: "https://www.gameshuffle.co/yes-no" },
  openGraph: { title: "Free Yes or No Decision Maker", url: "https://www.gameshuffle.co/yes-no" },
};

export default function YesNoPage() {
  return (
    <main>
      <FreeToolShell icon={IconArrowsSplit} name="Yes or No?" lede={<>Can&rsquo;t decide? Tap the button and let chance settle it.</>}>
        <YesNoTool />
      </FreeToolShell>
      <ProToolCta />
    </main>
  );
}
