import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/tournaments/swiss-and-deck-lists";
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
      <h1>Swiss tournaments and deck lists</h1>
      <p>
        In a Swiss tournament everyone plays every round, each time against someone on the same record, and nobody plays the
        same opponent twice. After the last round, the best records can go on to a top cut bracket. Swiss works for any game
        played one against one. Pick <strong>Swiss</strong>{" "}as the format when you{" "}
        <Link href="/help/tournaments/creating-a-tournament">create a tournament</Link>. Pokémon TCG events can also collect
        deck lists, in Swiss or any other format.
      </p>

      <h2>Set it up</h2>
      <p>With Swiss picked, the create form asks for four things:</p>
      <ul>
        <li><strong>Rounds:</strong> by player count, or 3 to 12.</li>
        <li><strong>Top cut:</strong> by player count, none, Top 4 or Top 8.</li>
        <li><strong>Each match:</strong> best of 1 or best of 3.</li>
        <li><strong>Round clock:</strong> 25 minutes, 50 minutes, or none. Pokémon TCG events start with 50 minutes, other games with none.</li>
      </ul>
      <p>
        Under the choices, the form spells out what you&apos;ll get with your field, for example &ldquo;5 rounds of Swiss, then
        a Top 4 bracket&rdquo;, and roughly how long it takes.
      </p>

      <h3>Rounds and top cut by player count</h3>
      <p>
        &ldquo;By player count&rdquo; follows the Play! Pokémon rules for one-day TCG events:
      </p>
      <ul>
        <li>4 to 8 players: 3 rounds, no top cut.</li>
        <li>9 to 12 players: 4 rounds, Top 4.</li>
        <li>13 to 20 players: 5 rounds, Top 4.</li>
        <li>21 to 32 players: 5 rounds, Top 8.</li>
        <li>33 to 64 players: 6 rounds, Top 8.</li>
        <li>65 to 128 players: 7 rounds, Top 8.</li>
      </ul>
      <p>
        Bigger fields get more rounds, and the cut stays at Top 8. The count is taken from the players seated when you pair
        round 1, and it doesn&apos;t change after that.
      </p>

      <h2>Run the rounds</h2>
      <p>Everything happens on the manage page&apos;s <strong>Run</strong>{" "}tab, which has one main button for the next step.</p>
      <ol>
        <li>Open the tournament for sign-ups. Swiss needs at least 4 confirmed players.</li>
        <li>Press <strong>Pair round 1</strong>. Every player with an account gets a GameShuffle notification with their table and opponent. The same happens for each new round and each top cut match.</li>
        <li>The round clock starts as soon as a round is paired. You can pause it, add 5 minutes, or restart it. Players see it count down on the tournament page.</li>
        <li>When every table has a result, the button pairs the next round.</li>
        <li>After the last round, the button starts the top cut, or finishes the tournament if there isn&apos;t one.</li>
        <li><strong>Finish the tournament</strong>{" "}saves the final standings and marks the event complete.</li>
      </ol>
      <p>
        To redo a round&apos;s pairings, press <strong>Re-pair this round</strong>. It works until anyone reports a result, and
        everyone gets new tables and a new notification. <strong>Display mode</strong>{" "}on the manage page opens a big-screen view of the round,
        the clock, the pairings and the standings for a TV at the venue.
      </p>

      <h2>How pairing works</h2>
      <ul>
        <li>Round 1 is random.</li>
        <li>After that, players are grouped by match points and paired at random inside each group, starting with the best record. An odd player out in a group plays someone from the group below.</li>
        <li>Nobody plays the same opponent twice, unless there&apos;s no other way to pair the round.</li>
        <li>With an odd number of players, one player gets a bye, which counts as a win. It goes at random to someone on the lowest record who hasn&apos;t had one yet.</li>
      </ul>

      <h2>Report results</h2>
      <p>
        Players report from their own match card on the tournament page: <strong>I won 2-0</strong>, <strong>I won 2-1</strong>,{" "}
        <strong>I lost 1-2</strong>, <strong>I lost 0-2</strong>{" "}or <strong>Tie</strong>{" "}in a best of 3, or{" "}
        <strong>I won</strong>, <strong>I lost</strong>{" "}or <strong>Tie</strong>{" "}in a best of 1.
      </p>
      <ul>
        <li>A result counts once both players report the same score.</li>
        <li>If they report different scores, the table shows &ldquo;Players disagree&rdquo; and you settle it from the Run tab.</li>
        <li>Players who joined as guests have no account to report from, so you enter their results.</li>
        <li>You can enter or change any result. A result can be changed until the round after next is paired.</li>
      </ul>

      <h2>Standings and tiebreakers</h2>
      <p>A win is 3 points, a tie 1, a loss 0. Players level on points are ordered by:</p>
      <ol>
        <li><strong>Opponents&apos; win %:</strong> how well the people you played did.</li>
        <li><strong>Opponents&apos; opponents&apos; win %.</strong></li>
        <li><strong>Head-to-head</strong>, only when exactly two players are level and they played each other.</li>
        <li>A fixed order, so the standings never shuffle on their own.</li>
      </ol>
      <p>
        A win % is wins divided by rounds played. A bye doesn&apos;t count as a win here. Every win % counts as at least 25%,
        and a player who dropped counts as at most 75%.
      </p>

      <h2>Drops and late joiners</h2>
      <ul>
        <li>A player can press <strong>Drop</strong>{" "}on the tournament page. You can drop someone from the Run tab with <strong>Drop a player</strong>. They aren&apos;t paired again and keep their record. If their match this round isn&apos;t finished, it counts as a loss for them.</li>
        <li>Removing a player from the Players tab after they&apos;ve been paired counts as a drop.</li>
        <li>If you drop someone by mistake, <strong>Bring a player back</strong>{" "}on the Run tab puts them back in with the record they had, until the next round is paired.</li>
        <li>Anyone confirmed or checked in when you pair a round plays from that round on. Rounds they missed count as losses.</li>
      </ul>

      <h2>The top cut</h2>
      <p>
        After the last Swiss round, press <strong>Start the Top 4</strong>{" "}or <strong>Start the Top 8</strong>. The best records
        still in the event go into a single elimination bracket, seeded from the standings. Players report cut matches the same
        way, and a cut match can&apos;t end in a tie. The final standings list the top cut by how far each player got, then
        everyone else by their Swiss standing.
      </p>

      <h2>Deck lists for Pokémon TCG</h2>
      <p>On a Pokémon TCG tournament, the create form has a <strong>Deck lists</strong>{" "}section:</p>
      <ul>
        <li><strong>When players send their list:</strong> Not needed, To join, or Before round 1.</li>
        <li><strong>Format:</strong> Standard, Expanded, or Anything goes. Every format checks the card counts. Standard also checks the regulation marks. Expanded doesn&apos;t check the Expanded card pool, so look those lists over yourself.</li>
        <li><strong>After the event:</strong> keep lists private, show the top cut&apos;s lists (the top 4&apos;s in formats without a cut), or show everyone&apos;s.</li>
      </ul>
      <p>
        A card we can&apos;t match to our catalog is marked for you to look at, and the list is never refused for it. The{" "}
        <Link href="/help/apps/tcg-deck-lists">deck lists article</Link>{" "}covers every check.
      </p>

      <h3>For players</h3>
      <ul>
        <li>When a list is needed to join, you pick one of your saved lists as you join, or paste a new one, which also saves to your deck lists. Guests can&apos;t join these events, because a deck list lives in an account. A free account is enough.</li>
        <li>When the list is due before round 1, send it from the tournament page with <strong>Send your deck list</strong>.</li>
        <li>You can swap your list until the event starts. Then lists lock.</li>
        <li>The tournament keeps its own copy, so editing your saved list later doesn&apos;t change what you sent.</li>
      </ul>

      <h3>For organizers</h3>
      <p>
        The Players tab shows how many lists are in, how many need a look and who&apos;s missing one. Open a list to read it,
        copy it for Pokémon TCG Live, or <strong>Mark checked</strong>. A player who swaps their list clears your check mark.{" "}
        <strong>Remind</strong>{" "}sends a notification to a player who hasn&apos;t sent one (guests have no account to remind).
        If lists are still missing when you start, you can pair round 1 anyway.
      </p>

      <h3>Who sees the lists</h3>
      <p>
        Until the event is complete, a list is seen by its player, you and your co-organizers. After that, the tournament page
        shows the lists you chose to share, best placement first, with <strong>Copy for TCG Live</strong>{" "}and{" "}
        <strong>Save to my decks</strong>{" "}on each.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> and we&apos;ll help you run it.</p>
    </HelpArticle>
  );
}
