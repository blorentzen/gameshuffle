import type { Metadata } from "next";
import Link from "next/link";
import { GuideArticle } from "@/components/guides/GuideArticle";
import { findGuide } from "@/lib/guides/manifest";

const SLUG = "how-to-run-a-tournament-with-friends";
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
        A tournament between friends fails for boring reasons. It runs an hour longer than anyone
        planned, someone knocked out in the first ten minutes spends the rest of the evening on
        their phone, and nobody can remember the score by the end. None of that is about the game.
      </p>

      <h2>Work backwards from how long you have</h2>
      <p>
        Decide the finish time first, then pick a format that fits inside it. A round takes roughly
        as long as one match times the number of simultaneous lobbies you can run, plus a couple of
        minutes of faff between rounds that everyone forgets to budget for.
      </p>
      <p>
        For an evening of three hours with eight people, you have room for a double-elimination
        bracket or a points night of eight to ten rounds. With sixteen people in the same window,
        single elimination or heats. If that sounds tight, it is: the most common mistake is
        planning a format that needs four hours for a night that has two and a half.
      </p>

      <h2>Six people is a real tournament</h2>
      <p>
        There is a persistent idea that you need sixteen or thirty-two players for a bracket to
        count. You do not. Six people playing a round robin, where everyone plays everyone, is a
        better evening than sixteen people where eleven of them are watching by nine o&rsquo;clock.
      </p>

      <h2>Keep the losers playing</h2>
      <p>
        Single elimination sends half your guests to the sofa after one match. If the point of the
        night is that people are playing, pick something that keeps them in it:
      </p>
      <ul>
        <li><strong>Round robin</strong> if you have eight or fewer. Everyone plays the same number of matches, and the standings sort themselves out.</li>
        <li><strong>Points</strong> for any size. Every round scores, nobody is eliminated, and you can stop after any round and still have a winner.</li>
        <li><strong>Double elimination</strong> if you want a bracket. A loss costs you, but it does not end your night.</li>
        <li><strong>Heats into mains</strong> for larger fields. Everyone races the same number of times, and a bad start puts you in a lower final rather than out.</li>
      </ul>
      <p>
        <Link href="/guides/tournament-formats-explained">The formats guide</Link> goes through each
        one with player counts and running times.
      </p>

      <h2>Decide the tie-break before you need it</h2>
      <p>
        Every tournament produces a tie, and the worst moment to invent a rule is when two people
        are tied and one of them is your brother-in-law. Write it down in advance: head-to-head
        result first, then total points, then a single decider match. Any rule is fine. Having one
        is the point.
      </p>

      <h2>Plan for someone leaving</h2>
      <p>
        Somebody will drop out, usually between rounds and usually without telling you. Decide up
        front whether their remaining matches are forfeits or whether you re-seed, and tell people
        which it is. In a points format this barely matters. In a bracket it decides who gets a free
        pass to the final, which people will notice.
      </p>

      <h2>Make the scoring somebody else&rsquo;s job</h2>
      <p>
        Whoever is running the night should not also be reconstructing the standings from memory at
        eleven o&rsquo;clock. Either hand the scoring to one person who is not playing, or put it
        somewhere everyone can see as it happens. Once the current standings are visible, arguments
        about who is winning stop, and the night keeps moving.
      </p>

      <h2>A shape that works</h2>
      <ol>
        <li>Pick the finish time. Everything else follows from it.</li>
        <li>Count who is definitely coming, then subtract one.</li>
        <li>Choose a format that keeps everyone playing for most of the evening.</li>
        <li>Write down the tie-break and the drop-out rule before the first match.</li>
        <li>Put the standings where people can see them.</li>
        <li>Stop while people still want one more round.</li>
      </ol>
      <p>
        That last one is underrated. A night that ends with people asking when the next one is has
        worked, whatever the bracket looked like.
      </p>
    </GuideArticle>
  );
}
