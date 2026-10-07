import type { Metadata } from "next";
import { ProToolCta } from "@/components/tools/ProToolCta";
import { FreeToolShell } from "@/components/tools/FreeToolShell";
import { TruthOrDareTool } from "@/components/tools/TruthOrDareTool";
import { TruthOrDarePicker } from "@/components/tools/TruthOrDarePicker";
import { getTruthOrDareSet } from "@/data/truth-or-dare";
import { IconMessageQuestion } from "@tabler/icons-react";

export const metadata: Metadata = {
  title: "Truth or Dare: free online prompt generator",
  description:
    "A free online Truth or Dare generator. Tap Truth, Dare, or Random for an endless supply of prompts: clean, party, and couples sets. No account required.",
  alternates: { canonical: "https://www.gameshuffle.co/truth-or-dare" },
  openGraph: { title: "Free Truth or Dare Generator", url: "https://www.gameshuffle.co/truth-or-dare" },
};

export default function TruthOrDarePage() {
  const set = getTruthOrDareSet("clean")!;
  return (
    <main>
      <FreeToolShell icon={IconMessageQuestion} name="Truth or Dare" lede="Tap Truth, Dare, or Random for an endless supply of prompts. Pick a set below to change the vibe.">
        <TruthOrDareTool truths={set.truths} dares={set.dares} />
        <TruthOrDarePicker currentSlug={set.slug} />
      </FreeToolShell>
      <ProToolCta />
    </main>
  );
}
