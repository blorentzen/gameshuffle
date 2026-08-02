import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@empac/cascadeds";
import { StreamTimerTool } from "@/components/tools/StreamTimerTool";

export const metadata: Metadata = {
  title: "Stream Timer — free countdown timer + OBS overlay",
  description:
    "A free stream countdown timer for 'starting soon', BRB, and break screens — with a transparent OBS browser-source overlay. No account required.",
  alternates: { canonical: "https://www.gameshuffle.co/stream-timer" },
  openGraph: { title: "Free Stream Timer", url: "https://www.gameshuffle.co/stream-timer" },
};

export default function StreamTimerPage() {
  return (
    <main>
      <Container className="tool-page">
        <h1 className="tool-page__title">Stream Timer</h1>
        <p className="tool-page__lead">
          A countdown for &ldquo;starting soon&rdquo;, breaks, and BRB screens — use it on screen, or
          drop the transparent overlay into OBS.
        </p>
        <StreamTimerTool />
        <p className="tool-page__lead">
          More free tools on the <Link href="/tools">tools hub</Link>.
        </p>
      </Container>
    </main>
  );
}
