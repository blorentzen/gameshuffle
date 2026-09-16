import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/tournaments/tournament-formats";
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
      <h1>Tournament Formats</h1>
      <p>
        The format decides how you score races and crown a winner. You pick it when you
        <a href="/help/tournaments/creating-a-tournament"> create a tournament</a>. Here&apos;s what
        each one is best for.
      </p>

      <h2>FFA points</h2>
      <p>
        Everyone races together and earns points by finishing position across a set of races. The
        points come from a scoring table (1st is worth the most), and cumulative standings update
        live as you enter each race. Best for casual nights and large fields where everyone plays
        every race.
      </p>

      <h2>Round robin</h2>
      <p>
        A points-based format built for smaller fields where you want a fair, everyone-plays
        structure across multiple races. Scores roll up the same way as FFA points.
      </p>

      <h2>Single elimination</h2>
      <p>
        A classic knockout bracket: lose once and you&apos;re out. You report each match winner and
        the bracket advances automatically until a champion is left. Best for head-to-head events
        with a clear finish.
      </p>

      <h2>Double elimination</h2>
      <p>
        Like single elimination, but a loss drops you to the losers&apos; bracket instead of out.
        Players get a second chance, and the event ends when one bracket runner beats the other.
        Best when you want results to reflect more than one bad match.
      </p>

      <h2>Group knockout (lobbies)</h2>
      <p>
        Split a large field into lobbies, race them, and advance the top finishers from each into the
        next round. Set your lobby size and how many advance. Best for big fields that can&apos;t all
        race at once.
      </p>

      <h2>Heat &rarr; Mains</h2>
      <p>
        The sprint-car style ladder: racers run heats, then feed into consolation mains and up to the
        A-Main, where the title is decided. It rewards a strong run through the night rather than a
        single race. This is also the format each event uses inside a
        <strong> Championship</strong> season.
      </p>

      <h2>Flights</h2>
      <p>
        Run several parallel groups (flights) that each race their own schedule, then combine into
        overall placements. Useful when you&apos;re running many players across multiple lobbies at
        once.
      </p>

      <h2>Which should I pick?</h2>
      <ul>
        <li><strong>Casual night, everyone plays:</strong> FFA points.</li>
        <li><strong>Small, fair, competitive:</strong> round robin.</li>
        <li><strong>Head-to-head bracket:</strong> single or double elimination.</li>
        <li><strong>Big field, can&apos;t all race together:</strong> group knockout or flights.</li>
        <li><strong>Sprint-car ladder / a season:</strong> Heat &rarr; Mains (or a Championship).</li>
      </ul>
      <p>
        Any format can also be run as a
        <a href="/help/tournaments/multi-crew-tournaments"> multi-crew battle</a>, where results roll
        up per crew on top of the individual standings.
      </p>

      <h2>Just want to try one?</h2>
      <p>
        You can experiment with brackets and Heat &rarr; Mains with no account and no database using
        the <Link href="/tournament/sandbox">tournament sandbox</Link>.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> and we&apos;ll point you at the right format.</p>
    </HelpArticle>
  );
}
