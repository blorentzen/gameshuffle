import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/apps/weekly-challenge";
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
      <h1>The Weekly Challenge</h1>
      <p>
        <Link href="/weekly">The Weekly Challenge</Link> is one challenge for everyone, new every Monday at midnight Pacific time. It has two
        parts, and both count toward the same weekly leaderboard.
      </p>

      <h2>The Tier War</h2>
      <p>
        Everyone ranks the same six things from S to D: pizza toppings, Mario Kart items, characters and more. You need to be
        signed in to play, and you can change your ranking until the week ends.
      </p>
      <p>
        The crowd&apos;s ranking is hidden until the next Monday, so nobody can copy it. Then every item lands in the tier most
        people picked, and you score 1 point for each item you put in the same tier, up to 6.
      </p>

      <h2>The game-night mission</h2>
      <p>
        Every <Link href="/help/apps/live-game-nights">live game night</Link>{" "}that week deals the same mission to everyone at
        the table. When your table confirms you did it, you get the night&apos;s points as usual and 3 more on the weekly
        leaderboard. You need a GameShuffle account in your seat for it to count.
      </p>

      <h2>The leaderboard and your profile</h2>
      <ul>
        <li>On Monday, <Link href="/weekly">/weekly</Link> shows last week&apos;s reveal, your score and the top of the leaderboard.</li>
        <li>Ties share a place. Private profiles show as &ldquo;A player&rdquo;.</li>
        <li>Finish in the top 10 and a <strong>Weekly top 10</strong> badge goes on your profile. It counts up each time you do it again.</li>
      </ul>

      <h2>Play in Discord</h2>
      <p>
        In any server with the GameShuffle bot, type <code>/gs-weekly</code> and tap <strong>Play</strong>. On a survey week you
        get a short form for your answer and your three guesses; on a Tier War week, a menu for each item. Your play counts on
        the GameShuffle account you sign in to with Discord, so sign in with Discord once (or connect Discord under
        Account › Profile › Connections) and your score lands on the same leaderboard. <strong>Last week</strong> shows the
        reveal and your place.
      </p>

      <h2>For streamers</h2>
      <p>
        Route the <strong>Weekly Challenge</strong> category on your <strong>Discord Bot</strong> tab, and every Monday your server
        gets a post with the new challenge, last week&apos;s winner and a <strong>Play</strong> button. It only posts if you
        route it. Members with Manage Server can also post the card any time with <code>/gs-weekly</code>.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
