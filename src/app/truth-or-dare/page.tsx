import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@empac/cascadeds";
import { TruthOrDareTool } from "@/components/tools/TruthOrDareTool";
import { TruthOrDarePicker } from "@/components/tools/TruthOrDarePicker";
import { getTruthOrDareSet } from "@/data/truth-or-dare";

export const metadata: Metadata = {
  title: "Truth or Dare — free online prompt generator",
  description:
    "A free online Truth or Dare generator. Tap Truth, Dare, or Random for an endless supply of prompts — clean, party, and couples sets. No account required.",
  alternates: { canonical: "https://www.gameshuffle.co/truth-or-dare" },
  openGraph: { title: "Free Truth or Dare Generator", url: "https://www.gameshuffle.co/truth-or-dare" },
};

export default function TruthOrDarePage() {
  const set = getTruthOrDareSet("clean")!;
  return (
    <main>
      <Container className="tool-page">
        <h1 className="tool-page__title">Truth or Dare</h1>
        <p className="tool-page__lead">
          Tap Truth, Dare, or Random for an endless supply of prompts. Pick a set below to change
          the vibe.
        </p>
        <TruthOrDareTool truths={set.truths} dares={set.dares} />
        <TruthOrDarePicker currentSlug={set.slug} />
        <p className="tool-page__lead">
          More free tools on the <Link href="/tools">tools hub</Link>.
        </p>
      </Container>
    </main>
  );
}
