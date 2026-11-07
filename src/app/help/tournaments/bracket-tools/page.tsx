import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/tournaments/bracket-tools";
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
      <h1>Free bracket tools</h1>
      <p>
        Three free tools make a bracket, a schedule or pairings right in your browser, with no account: the{" "}
        <Link href="/bracket-generator">bracket generator</Link>{" "}(single or double elimination), the{" "}
        <Link href="/round-robin-generator">round robin generator</Link>{" "}and the{" "}
        <Link href="/swiss-pairing-generator">Swiss pairing generator</Link>. Each takes up to 64 players or teams.
      </p>

      <h2>Add your players</h2>
      <ul>
        <li>Type or paste names into the box, one per line. A single line of names split by commas works too, and list numbers or bullets drop off.</li>
        <li>A name typed twice gets a number, so each one stays its own player.</li>
        <li>Past 64 names, the rest are left out and the tool says how many.</li>
        <li><strong>Shuffle the order</strong>{" "}mixes the list. <strong>Try it with 8 sample names</strong>{" "}fills it in to try the tool.</li>
        <li>Give it a <strong>Name</strong>{" "}if you like. It shows above the board and on the printout.</li>
      </ul>
      <p>
        The smallest field is 2 players for single elimination, 3 for a round robin, and 4 for double elimination or Swiss.
      </p>

      <h2>Single and double elimination</h2>
      <p>
        Pick <strong>Single elimination</strong>{" "}(lose once and you&apos;re out) or <strong>Double elimination</strong>{" "}(lose
        once and you drop to the losers bracket, lose twice and you&apos;re out), then press <strong>Make the bracket</strong>.
      </p>
      <ul>
        <li>The first name on the list is the top seed, so seeds 1 and 2 can only meet in the final.</li>
        <li>When the field isn&apos;t 4, 8, 16, 32 or 64, the bracket rounds up and the top seeds get byes into round two.</li>
        <li>Tap a player to send them through. Tap them again to take it back.</li>
        <li>If you change an earlier winner, later picks that no longer fit are cleared.</li>
        <li>Once the final is decided, the board names the winner and lists the final places.</li>
      </ul>

      <h2>Round robin</h2>
      <p>Everyone plays everyone, a round at a time. Press <strong>Make the schedule</strong>.</p>
      <ul>
        <li><strong>Everyone plays twice</strong>{" "}adds a second leg.</li>
        <li><strong>Ties count</strong>{" "}lets you mark a match as a tie.</li>
        <li>With an odd number of players, one player sits out each round, and everyone sits out once per leg.</li>
        <li>Mark each match&apos;s result and the standings update: 3 points for a win, 1 for a tie. Players level on points are split by head-to-head when exactly two are level, then by wins, then by their place on your list.</li>
      </ul>

      <h2>Swiss pairings</h2>
      <p>
        Set <strong>Rounds</strong>{" "}(the suggested number for your field, or 1 to 12), a <strong>Top cut</strong>{" "}(suggested,
        none, Top 4 or Top 8) and whether <strong>Ties count</strong>, then press <strong>Pair round 1</strong>. Pairings,
        byes and tiebreakers follow the same rules as{" "}
        <Link href="/help/tournaments/swiss-and-deck-lists">Swiss tournaments</Link>.
      </p>
      <ul>
        <li>Enter each table&apos;s result. Once every table has one, press <strong>Pair round 2</strong>, and so on.</li>
        <li>Only the round in play takes results. Earlier rounds are settled once the next one is paired.</li>
        <li><strong>Pair again</strong>{" "}redoes the round&apos;s pairings until its first result is in.</li>
        <li>Between rounds, <strong>Drop</strong>{" "}beside a name in the standings takes that player out of the pairings. They keep their record. <strong>Bring back</strong>{" "}undoes it.</li>
        <li>After the last round, <strong>Start the Top 4</strong>{" "}or <strong>Start the Top 8</strong>{" "}makes a bracket seeded from the standings, first against last. Pick its winners the same way as in the bracket generator.</li>
      </ul>

      <h2>Save, share and print</h2>
      <ul>
        <li>Everything stays in your browser. Come back on the same browser and your board is there. Nothing is saved on GameShuffle.</li>
        <li><strong>Change players</strong>{" "}takes you back to the list. If the board has results, it asks first, because making it again clears them.</li>
        <li><strong>Copy link</strong>{" "}copies a link that opens the board with every result so far. Whoever opens it gets their own copy, and changes made after that stay in the browser where they were made. Copy a new link to pass on the latest results.</li>
        <li><strong>Print</strong>{" "}prints just the board, on a landscape page, scaled to fit. Print right after making it for a blank bracket to fill in by hand.</li>
      </ul>

      <h2>Run it live</h2>
      <p>
        <strong>Run it live</strong>{" "}turns the board into a GameShuffle tournament, where players join from their phones and
        report their own results. You&apos;ll be asked to sign in first if you aren&apos;t.
      </p>
      <ul>
        <li>The create form opens with your name for the event and the format filled in. A bracket stays single or double elimination, and Swiss stays Swiss.</li>
        <li>A round robin runs as Swiss with everyone meeting once, up to 12 rounds.</li>
        <li>Pick the game and the rest of the details, then create it. Your players are added as guests and can claim their spot later.</li>
        <li>If the tournament&apos;s player limit is lower than your list, the names past it aren&apos;t added, and you&apos;re told how many.</li>
        <li>The tournament opens on its Players tab. Results from the free tool don&apos;t carry over.</li>
        <li>Your list waits in the browser for 24 hours, so you can come back to the create form later that day.</li>
      </ul>
      <p>
        See <Link href="/help/tournaments/creating-a-tournament">creating a tournament</Link>{" "}for everything else on the create
        form.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
