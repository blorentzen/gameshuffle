import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/streaming/who-said-it";
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
      <h1>Who Said It?</h1>
      <p>
        Who Said It? turns your channel&apos;s <code>!quote</code> pool into a game: a quote goes up with the speaker hidden
        and chat votes on who said it. It runs on the <Link href="/help/streaming/polls">polls</Link> engine, so it shows on your
        overlay and <code>/live</code> page like any poll. It&apos;s a GameShuffle Pro feature.
      </p>

      <h2>Add quotes with a speaker</h2>
      <p>The game only uses quotes that say who said them. Add them like this:</p>
      <p><code>!quote add That blue shell was personal - Maya</code></p>
      <p>Anything after the last dash (or an em dash or <code>~</code>) becomes the speaker. A score like &ldquo;3 - 2&rdquo; isn&apos;t mistaken for a name. You&apos;ll need quotes from at least two different people. Speakers show on your public quote page.</p>

      <h2>Run a round</h2>
      <ul>
        <li><strong>Start:</strong> <code>!whosaid</code> (broadcaster and mods). Chat sees the quote and up to four names to pick from.</li>
        <li><strong>Vote:</strong> <code>!vote &lt;number&gt;</code>, same as any poll.</li>
        <li><strong>Reveal:</strong> <code>!whosaid reveal</code> closes the round and announces the answer and how many people got it right. <code>!poll close</code> works too.</li>
      </ul>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
