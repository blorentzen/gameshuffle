import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/apps/live-game-nights";
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
      <h1>Live game nights</h1>
      <p>
        A live night puts everyone&apos;s phone in the game. The host runs a lineup of games (Mario Kart,
        Mario Party, and our own phone games), everyone joins with a room code, and every game feeds one
        scoreboard that crowns the night&apos;s MVP.
      </p>

      <h2>Starting a night</h2>
      <ul>
        <li>From a <strong>game night</strong> you&apos;re hosting: add the Mario Party module and start it. People who RSVP&apos;d are already seated.</li>
        <li>From the <Link href="/game-nights/tools/night-planner">Night Planner</Link>: tell it who&apos;s coming and how long you have, and start the lineup it suggests.</li>
        <li>From a <strong>randomizer</strong> or a <strong>game night tool</strong> such as <Link href="/game-nights/tools/the-gauntlet">The Gauntlet</Link>, <Link href="/game-nights/tools/chaos-cup">Chaos Cup</Link>, <Link href="/game-nights/tools/odd-one-out">Odd One Out</Link> or <Link href="/game-nights/tools/most-likely-to">Most Likely To</Link>: use the &ldquo;play on everyone&apos;s phones&rdquo; button.</li>
      </ul>
      <p>Hosting needs a free account. Players can join as guests; with an account their points count toward seasons and their profile.</p>

      <h2>Joining and the TV</h2>
      <ol>
        <li>Players scan the QR code or open the link and tap <strong>This is me</strong> on their seat.</li>
        <li>The host taps <strong>Open on the TV</strong> to put the night on a big screen. The TV always shows the public view, so nobody&apos;s secret word or card can appear on it, even from the host&apos;s laptop.</li>
      </ol>

      <h2>How scoring works</h2>
      <ul>
        <li>Every game pays <strong>10, 6, 3 and 1</strong> points for the top four. For console games the host taps in the finishing order; phone games score themselves.</li>
        <li>Missions, bounties, awards and <strong>Call It</strong> add extra points.</li>
        <li>End the night to crown the MVP. The recap can be copied or posted to your community, and with GS Pro, <strong>Write it up with AI</strong> turns it into a Discord post and a short post for X or Bluesky (see <a href="/help/apps/ai-tools">AI tools</a>).</li>
      </ul>

      <h2>Night formats</h2>
      <ul>
        <li><strong>The Gauntlet:</strong> 4 to 8 events on one scoreboard, and the winner is the Gauntlet champion.</li>
        <li><strong>Chaos Cup:</strong> a Mario Kart cup where every race gets a modifier. The host rolls three (an item rule, a race setting, a handicap for the leader) and picks one, or lets stream chat vote on it.</li>
      </ul>

      <h2>Extra layers the host can switch on</h2>
      <ul>
        <li><strong>Hidden Agendas:</strong> a secret objective for each player, like &ldquo;finish exactly 5th&rdquo;. Nobody else sees yours, not even the host if they&apos;re playing, until the game&apos;s results are saved. Then all of them are revealed and the table confirms who pulled it off.</li>
        <li><strong>Call It:</strong> before each console game, everyone calls the winner on their phone. A right call is worth 2 points. Calls stay hidden until the results are in.</li>
        <li><strong>Wheel of Consequences:</strong> once the next game starts, spin a handicap for the last game&apos;s winner or a perk for last place. It lasts that game only, and the TV shows the wheel.</li>
        <li><strong>King of the Couch:</strong> your group&apos;s crown. The first game crowns its winner; after that, whenever the holder plays and someone else wins, the winner takes it. It carries over from night to night.</li>
      </ul>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
