import type { Metadata } from "next";
import { ProToolCta } from "@/components/tools/ProToolCta";
import { FreeToolShell } from "@/components/tools/FreeToolShell";
import { NamePickerTool } from "@/components/tools/NamePickerTool";
import { IconUserSearch } from "@tabler/icons-react";

export const metadata: Metadata = {
  title: "Random Name Picker: pick a winner, free",
  description:
    "A free random name picker: paste a list and draw one or more winners for giveaways, raffles and stream shout-outs. No account required.",
  alternates: { canonical: "https://www.gameshuffle.co/name-picker" },
  openGraph: { siteName: "GameShuffle", title: "Free Random Name Picker", url: "https://www.gameshuffle.co/name-picker" },
};

export default function NamePickerPage() {
  return (
    <main>
      <FreeToolShell icon={IconUserSearch} name="Random Name Picker" lede="Paste your entries and draw random winners, for giveaways, raffles, and shout-outs.">
        <NamePickerTool />
      </FreeToolShell>
      <ProToolCta />
    </main>
  );
}
