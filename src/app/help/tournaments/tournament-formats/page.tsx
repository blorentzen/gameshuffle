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
  openGraph: { siteName: "GameShuffle", title: `${meta.title} | GameShuffle Help`, description: meta.description, url: `https://www.gameshuffle.co${HREF}` },
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

      <p>
        The create form offers six: <strong>FFA / Points</strong>, <strong>Single Elim</strong>,{" "}
        <strong>Double Elim</strong>, <strong>Heat &rarr; Mains</strong>, <strong>Swiss</strong>{" "}and{" "}
        <strong>Time trial</strong>. Which ones show depends on the game.
      </p>

      <h2>FFA / Points</h2>
      <p>
        Everyone races together and earns points by finishing position across a set of races. The
        points come from a scoring table (1st is worth the most), and the standings update live as
        you enter each race. Best for casual nights and fields where everyone plays every race.
      </p>
      <p>
        For Mario Party and Smash, points run in flights of four: each table or free-for-all scores 10, 6, 3
        and 1, plus any mission bonus points, and every flight plays the same rolled board or stage each round.
      </p>

      <h2>Single and double elimination</h2>
      <p>
        A knockout bracket. In single elimination, lose once and you&apos;re out. In double
        elimination, a loss drops you to the lower bracket instead, and the event ends when one
        bracket&apos;s winner beats the other. You report each match winner and the bracket advances
        on its own.
      </p>
      <p>
        <strong>Players per lobby</strong>{" "}sets how many race in each match. Lobbies of 2 make a classic 1v1
        bracket. Bigger lobbies split a large field into groups that race together, and the top
        finishers in each move on; you set how many.
      </p>

      <h2>Heat &rarr; Mains</h2>
      <p>
        The sprint-car style ladder for racing games: racers run heats, then feed into consolation
        mains and up to the A-Main, where the title is decided. It rewards a strong run through the
        night rather than a single race. This is also the format each event uses inside a
        <strong> Championship</strong> season.
      </p>

      <h2>Swiss</h2>
      <p>
        For one-on-one games. Round 1 pairs players at random; after that everyone plays someone on
        the same record, and nobody plays the same person twice. A win is worth 3 points and a tie 1,
        and ties in the standings go to opponents&apos; win rate. The number of rounds and the top cut
        (none, Top 4 or Top 8) come from the player count unless you set them, and the best records
        play the top cut as a single elimination bracket. See
        <a href="/help/tournaments/swiss-and-deck-lists"> Swiss tournaments and deck lists</a>{" "}for
        reporting, byes, drops and deck lists.
      </p>

      <h2>Time trial</h2>
      <p>
        For Mario Kart 8 Deluxe and Mario Kart World. Players add their times on the tracks you pick, with a screenshot of
        the result screen, and rank by total time or by points per track. Run one leaderboard over a window, or rounds of
        groups with a cut. Swiss and elimination brackets can also decide each match by the two players&apos; times. See{" "}
        <a href="/help/tournaments/time-trial-tournaments">Time trial tournaments</a>.
      </p>

      <h2>Which should I pick?</h2>
      <ul>
        <li><strong>Casual night, everyone plays:</strong> FFA / Points.</li>
        <li><strong>Head-to-head bracket:</strong> single or double elimination with lobbies of 2.</li>
        <li><strong>Big field, can&apos;t all race together:</strong> elimination with bigger lobbies.</li>
        <li><strong>One-on-one, everyone plays every round:</strong> Swiss.</li>
        <li><strong>Sprint-car ladder or a season:</strong> Heat &rarr; Mains, or a Championship.</li>
        <li><strong>Fastest times, no lobbies to fill:</strong> Time trial.</li>
        <li><strong>A small group where everyone plays everyone:</strong> the free{" "}<a href="/round-robin-generator">round robin generator</a>, which needs no account. Its Run it live button turns it into a Swiss event.</li>
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
