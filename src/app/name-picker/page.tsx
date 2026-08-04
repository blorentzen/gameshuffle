import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@empac/cascadeds";
import { ProToolCta } from "@/components/tools/ProToolCta";
import { NamePickerTool } from "@/components/tools/NamePickerTool";

export const metadata: Metadata = {
  title: "Random Name Picker — pick a winner, free",
  description:
    "A free random name picker. Paste a list of names or entries and draw one or more random winners — perfect for giveaways, raffles, and stream shout-outs. No account required.",
  alternates: { canonical: "https://www.gameshuffle.co/name-picker" },
  openGraph: { title: "Free Random Name Picker", url: "https://www.gameshuffle.co/name-picker" },
};

export default function NamePickerPage() {
  return (
    <main>
      <Container className="tool-page">
        <h1 className="tool-page__title">Random Name Picker</h1>
        <p className="tool-page__lead">
          Paste your entries and draw random winners — for giveaways, raffles, and shout-outs.
        </p>
        <NamePickerTool />
        <ProToolCta />
        <p className="tool-page__lead">
          More free tools on the <Link href="/tools">tools hub</Link>.
        </p>
      </Container>
    </main>
  );
}
