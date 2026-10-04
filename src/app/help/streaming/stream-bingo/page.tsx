import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/streaming/stream-bingo";
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
      <h1>Stream Bingo</h1>
      <p>
        Stream Bingo is number bingo for your viewers. They take a card on your <code>/live</code> page, numbers get called
        by you, your mods or a timer, and the first real bingo wins your prize. It&apos;s a GameShuffle Pro feature.
      </p>

      <h2>Start a game</h2>
      <p>
        Use <strong>Account &gt; Community &amp; Chat &gt; Stream Bingo</strong>, or type
        <code>!bingo start [pattern] [tokens] [prize]</code> in chat. For example, <code>!bingo start corners 500 picks the next track</code>.
        Your community runs one game at a time.
      </p>
      <ul>
        <li><strong>Patterns:</strong> any line (a row, column or diagonal), four corners, the X (both diagonals), picture frame (every edge square) or blackout (the whole card).</li>
        <li><strong>Series:</strong> choose <code>series</code> and each new game takes the next pattern in order: line, corners, X, frame, blackout.</li>
        <li><strong>Prize:</strong> tokens come out of your monthly award allowance. You can also add your own prize, like a shout-out or picking the next track. Use either or both.</li>
      </ul>

      <h2>Call numbers</h2>
      <ul>
        <li><code>!bingo call</code> (you and your mods) or the <strong>Call the next number</strong> button.</li>
        <li><code>!bingo auto 60</code> calls a number every 60 seconds (30 to 600). <code>!bingo auto off</code> stops the timer.</li>
        <li><code>!bingo end</code> ends the game with no winner. <code>!bingo status</code> tells chat where it&apos;s up to.</li>
      </ul>

      <h2>How viewers play</h2>
      <p>
        Viewers sign in on your live page and tap <strong>Get a card</strong>. They mark their own squares as numbers come up,
        then tap <strong>Bingo!</strong>. GameShuffle checks the card against the numbers actually called, so marking extra
        squares doesn&apos;t help. The first valid claim wins, gets the prize and is announced in your chat. In chat,
        <code>!bingocard</code> posts the link to your live page.
      </p>

      <h2>Show it on stream</h2>
      <p>
        Add the <strong>Number Bingo</strong> piece in Overlay Layout (see <Link href="/help/streaming/obs-overlay">the OBS overlay</Link>). It shows the latest call,
        the board of every number called, the pattern and the prize, and a winner banner when someone gets it. The timer
        runs while your overlay or live page is open.
      </p>

      <h2>Bingo at a game night</h2>
      <p>
        The same game runs on phones and a TV at a <Link href="/help/apps/party-games">live game night</Link>, with no stream needed.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
