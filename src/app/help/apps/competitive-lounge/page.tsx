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
      <h1>Competitive Lounge Scoring</h1>
      <p>
        The competitive lounge is live, normalized scoring for a Mario Kart 8 Deluxe session. Everyone
        logs their own placement each race, and the standings update in real time for all to see. It&apos;s
        in Beta and currently covers Mario Kart 8 Deluxe.
      </p>

      <h2>Start a lounge</h2>
      <ol>
        <li>Open the <Link href="/competitive/mario-kart-8-deluxe">competitive hub</Link>.</li>
        <li>Pick a <strong>match format</strong>: FFA (up to 12 players), or teams, 2v2, 3v3, 4v4, or 6v6.</li>
        <li>Click <strong>Create Lounge</strong>. You&apos;ll need an account, signing in is required to create or play.</li>
      </ol>
      <p>A new lounge runs 12 races on the standard Mario Kart scoring table.</p>

      <h2>Get everyone in</h2>
      <p>
        Share the lounge link with your players. Everyone opens it on their own device. The page is a
        public viewer, so anyone can watch, but logging placements requires a signed-in account.
      </p>

      <h2>How scoring works</h2>
      <ul>
        <li>After each race, <strong>each player logs their own finishing position</strong>. You only ever enter your own result, so there are no conflicts.</li>
        <li>Standings recalculate live and sync to everyone via real-time updates.</li>
        <li>Team modes total each team&apos;s points; FFA ranks individuals.</li>
      </ul>

      <h2>Session flow</h2>
      <p>
        A lounge moves through phases: <strong>waiting</strong> &rarr; <strong>character select</strong>
        &rarr; <strong>lobby</strong> &rarr; <strong>in progress</strong> &rarr;
        <strong> complete</strong>. Everyone sees the same phase and standings as they change.
      </p>

      <h2>Lounge vs tournament</h2>
      <p>
        A lounge is the quickest way to score a single competitive session with friends. For brackets,
        heats, sign-ups, or crew battles, create a
        <a href="/help/tournaments/creating-a-tournament"> tournament</a> instead.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> with any lounge questions.</p>
    </HelpArticle>
  );
}
