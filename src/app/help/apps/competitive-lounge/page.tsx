import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/apps/competitive-lounge";
const meta = findArticle(HREF)!;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: `https://www.gameshuffle.co${HREF}` },
  openGraph: { title: `${meta.title} | GameShuffle Help`, description: meta.description, url: `https://www.gameshuffle.co${HREF}` },
  robots: { index: true, follow: true },
};

export default function Page() {
  return (
    <HelpArticle href={HREF}>
      <h1>Live scoring</h1>
      <p>
        Live scoring keeps the score for a set of Mario Kart 8 Deluxe or Mario Kart World between friends.
        Everyone logs their own placement each race, and the standings update in real time for all to see.
        (It used to be called the competitive lounge. Lounge stats from MKCentral are on the{" "}
        <Link href="/competitive-mario-kart">competitive Mario Kart</Link> page.)
      </p>

      <h2>Start a set</h2>
      <ol>
        <li>Open <Link href="/competitive/mario-kart-8-deluxe">live scoring</Link> and pick the game.</li>
        <li>Pick a <strong>match format</strong>: FFA (up to 12 players), or teams, 2v2, 3v3, 4v4, or 6v6.</li>
        <li>Press <strong>Start FFA scoring</strong> (or your team format). You need an account to start or play.</li>
      </ol>
      <p>A set runs 12 races on the standard Mario Kart scoring table.</p>

      <h2>Get everyone in</h2>
      <p>
        Share the set&apos;s link with your players. Everyone opens it on their own device. Anyone can watch,
        but logging placements needs a signed-in account.
      </p>

      <h2>How scoring works</h2>
      <ul>
        <li>After each race, <strong>each player logs their own finishing position</strong>. You only ever enter your own result, so there are no conflicts.</li>
        <li>Standings recalculate live and sync to everyone.</li>
        <li>Team modes total each team&apos;s points; FFA ranks individuals.</li>
      </ul>

      <h2>Session flow</h2>
      <p>
        A set moves through phases: <strong>waiting</strong> &rarr; <strong>character select</strong>
        &rarr; <strong>lobby</strong> &rarr; <strong>in progress</strong>{" "}&rarr;
        <strong> complete</strong>. Everyone sees the same phase and standings as they change.
      </p>

      <h2>Live scoring or a tournament</h2>
      <p>
        Live scoring is the quickest way to score one set with friends. For brackets, heats, sign-ups, or
        crew battles, create a{" "}
        <a href="/help/tournaments/creating-a-tournament">tournament</a> instead.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> with any questions.</p>
    </HelpArticle>
  );
}
