import type { Metadata } from "next";
import Link from "next/link";
import { GuideArticle } from "@/components/guides/GuideArticle";
import { findGuide } from "@/lib/guides/manifest";

const SLUG = "tournament-formats-explained";
const meta = findGuide(SLUG)!;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: `https://www.gameshuffle.co/guides/${SLUG}` },
  openGraph: { title: `${meta.title} | GameShuffle`, description: meta.description, url: `https://www.gameshuffle.co/guides/${SLUG}` },
};

export default function Page() {
  return (
    <GuideArticle slug={SLUG}>
      <p>
        Most guides to tournament formats explain how a bracket works and stop. The harder question
        is which format suits the evening you are actually having, and the answer changes completely
        between six people and sixty.
      </p>

      <h2>Single elimination</h2>
      <p>
        Lose once, you are out. The field halves every round, so it finishes fast and predictably:
        sixteen players is four rounds, thirty-two is five.
      </p>
      <p>
        <strong>Good for:</strong> large fields, hard time limits, and anything you are streaming
        where a clean narrative matters.<br />
        <strong>Bad for:</strong> a living room. Half your guests are out after one match, and the
        person who drew the strongest player first is out purely on scheduling.
      </p>

      <h2>Double elimination</h2>
      <p>
        Two brackets. Lose in the winners bracket and you drop to the losers bracket rather than
        going home; lose twice and you are out. Roughly double the matches of single elimination for
        the same field, so budget the time.
      </p>
      <p>
        <strong>Good for:</strong> competitive fields where one bad match should not decide it.<br />
        <strong>Bad for:</strong> short evenings. It is the format most likely to overrun.
      </p>

      <h2>Round robin</h2>
      <p>
        Everyone plays everyone. With six players that is fifteen matches; with ten it is
        forty-five. The growth is what limits it, and it catches people out.
      </p>
      <p>
        <strong>Good for:</strong> eight players or fewer. The fairest result you can get, because
        nobody&rsquo;s finish depends on the draw.<br />
        <strong>Bad for:</strong> anything above ten, where the match count runs away.
      </p>

      <h2>Points</h2>
      <p>
        Everyone plays every round and scores by finishing position. Highest total after the last
        round wins. No elimination, no bracket, and you can add or drop a round without breaking
        anything.
      </p>
      <p>
        <strong>Good for:</strong> almost every casual night, especially with mixed skill levels and
        people arriving late.<br />
        <strong>Bad for:</strong> tension at the end. A big lead can make the last round meaningless
        unless you weight it.
      </p>

      <h2>Heats into mains</h2>
      <p>
        Borrowed from sprint car racing, and underused outside it. The field splits into heats, and
        how you finish your heat decides which final you are in. Win it and you are in the A Main.
        Otherwise you are in the B or C, racing to transfer up.
      </p>
      <p>
        <strong>Good for:</strong> larger fields where you still want everyone racing all night.
        Nobody is eliminated, and the lower finals are genuinely competitive because there is
        something to win.<br />
        <strong>Bad for:</strong> very small groups. Below about twelve there is nothing to split.
      </p>

      <h2>Picking one</h2>
      <table>
        <thead>
          <tr><th>Players</th><th>Have two hours</th><th>Have an evening</th></tr>
        </thead>
        <tbody>
          <tr><td>4 to 6</td><td>Points</td><td>Round robin</td></tr>
          <tr><td>7 to 10</td><td>Points</td><td>Round robin or double elim</td></tr>
          <tr><td>11 to 20</td><td>Single elim</td><td>Heats into mains</td></tr>
          <tr><td>20 or more</td><td>Single elim</td><td>Heats into mains</td></tr>
        </tbody>
      </table>

      <h2>The format is not the fun</h2>
      <p>
        A format decides who wins. It does not decide whether the evening was any good. That comes
        from whether people were playing rather than watching, whether the matches were close, and
        whether anyone could tell what was going on. Pick the format that keeps the most people in
        the most matches, and you will be right more often than not.
      </p>
      <p>
        If you are running something where one person always wins,{" "}
        <Link href="/guides/how-to-run-a-tournament-with-friends">the friends guide</Link> covers
        how to keep the night competitive anyway.
      </p>
    </GuideArticle>
  );
}
