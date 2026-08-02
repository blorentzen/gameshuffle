import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@empac/cascadeds";
import { MagicEightBallTool } from "@/components/tools/MagicEightBallTool";

export const metadata: Metadata = {
  title: "Magic 8-Ball — free online yes/no answers",
  description:
    "Ask the Magic 8-Ball a yes-or-no question and shake for one of the 20 classic answers. A free online 8-ball — no account required.",
  alternates: { canonical: "https://www.gameshuffle.co/magic-8-ball" },
  openGraph: { title: "Free Online Magic 8-Ball", url: "https://www.gameshuffle.co/magic-8-ball" },
};

export default function MagicEightBallPage() {
  return (
    <main>
      <Container className="tool-page">
        <h1 className="tool-page__title">Magic 8-Ball</h1>
        <p className="tool-page__lead">
          Think of a yes-or-no question, then shake the ball for one of the 20 classic answers.
        </p>
        <MagicEightBallTool />
        <p className="tool-page__lead">
          More free tools on the <Link href="/tools">tools hub</Link>.
        </p>
      </Container>
    </main>
  );
}
