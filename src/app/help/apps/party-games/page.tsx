import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/apps/party-games";
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
      <h1>Party games on your phones</h1>
      <p>
        These are GameShuffle&apos;s own games. Add any of them to a <Link href="/help/apps/live-game-nights">live night</Link>&apos;s
        lineup (or start one from the game night tools). They play on everyone&apos;s phone with the reveal on the TV, and
        each one&apos;s final standings become placements on the night&apos;s scoreboard. Most need at least three players.
      </p>

      <h2>Odd One Out</h2>
      <p>Everyone gets the same secret word except one player, who only sees the category. Go around the room giving one-word hints out loud, then vote on your phone for who&apos;s faking it.</p>
      <ul>
        <li>Vote for the odd one out: <strong>+2</strong>.</li>
        <li>The odd one out gets <strong>+3</strong> if nobody catches them. If they&apos;re caught, they get one guess at the word, worth <strong>+2</strong> (spelling and plurals are forgiven, and the host can accept a guess said out loud).</li>
      </ul>
      <p>There&apos;s also a free <Link href="/game-nights/tools/odd-one-out">one-device version</Link> you play by passing the phone.</p>

      <h2>Most Likely To</h2>
      <p>A prompt goes up on the TV (&ldquo;Who&apos;s most likely to rage quit a Mario Kart race?&rdquo;) and everyone votes for a player, themselves included. Votes are anonymous; only the counts are shown. Score a point each time your vote matches the room&apos;s pick.</p>

      <h2>Tier Wars</h2>
      <p>Everyone ranks the same six things from S to D. The reveal builds the room&apos;s tier list, where each item lands in the tier most people picked. You score a point for every item you put where the room did, and the biggest disagreement gets called out as the hottest take. Topics include our own lists and every Tier List Maker template.</p>

      <h2>Draft Night</h2>
      <p>Snake-draft characters from one game&apos;s roster (2 to 5 picks each). Each pick has a 45-second clock; if it runs out, a random character is picked for you. For the rest of the night everyone plays only from the pool they drafted, and the pools show on every phone and the TV.</p>

      <h2>Number Bingo</h2>
      <p>Everyone gets a 75-ball card on their phone. The host calls numbers, which show big on the TV, and you mark your own card. The host picks the pattern to win (any line, four corners, the X, picture frame or blackout) or a series that changes it every round. A <strong>Bingo!</strong> claim is checked against the numbers actually called, so it can&apos;t be faked. Most rounds won takes the game.</p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
