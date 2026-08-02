import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@empac/cascadeds";
import { YesNoTool } from "@/components/tools/YesNoTool";

export const metadata: Metadata = {
  title: "Yes or No — free random decision maker",
  description:
    "Can't decide? Hit the button for a random Yes or No (add Maybe if you like). A free yes-or-no decision maker with a running tally — no account required.",
  alternates: { canonical: "https://www.gameshuffle.co/yes-no" },
  openGraph: { title: "Free Yes or No Decision Maker", url: "https://www.gameshuffle.co/yes-no" },
};

export default function YesNoPage() {
  return (
    <main>
      <Container className="tool-page">
        <h1 className="tool-page__title">Yes or No?</h1>
        <p className="tool-page__lead">
          Can&rsquo;t decide? Tap the button and let chance settle it.
        </p>
        <YesNoTool />
        <p className="tool-page__lead">
          More free tools on the <Link href="/tools">tools hub</Link>.
        </p>
      </Container>
    </main>
  );
}
