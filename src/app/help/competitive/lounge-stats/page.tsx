import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/competitive/lounge-stats";
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
      <h1>Lounge stats</h1>
      <p>
        <Link href="/lounge">Lounge stats</Link>{" "}shows any Mario Kart lounge player&apos;s season: MMR,
        division, world rank, nights, partners and every past season. The numbers come from
        MKCentral&apos;s lounge, for Mario Kart 8 Deluxe and Mario Kart World (12 and 24 players).
        Anyone can look a player up, with or without an account. MMR only moves once lounge staff
        verify an event&apos;s table.
      </p>

      <h2>Find a player</h2>
      <p>
        Type in the <strong>Find a player</strong>{" "}box at the top of the lounge page. It takes a
        lounge name, part of one, or a friend code. From two letters it suggests players from every
        game, best MMR first. Use the <strong>Search in</strong>{" "}chips (All games, MK8DX, MK World
        12P, MK World 24P) to look in one game only.
      </p>
      <p>
        If nobody has the name you typed, the page lists the closest names under{" "}
        <strong>Did you mean</strong>. Players you&apos;ve opened show under{" "}
        <strong>Looked up lately</strong>, on that device only.
      </p>

      <h2>The lounge page</h2>
      <p>Under the search, the lounge page has:</p>
      <ul>
        <li><strong>The season so far:</strong> players, events played, the median MMR and how many tables are waiting for staff.</li>
        <li><strong>Boards:</strong> the world top 10, the players climbing this week, countries (those with six or more players, ranked by their top six players&apos; average), and On GameShuffle.</li>
        <li><strong>Divisions:</strong> where each division starts and how many players are in it. Type a number under <strong>Try an MMR</strong>{" "}to see its division and its place this season.</li>
        <li><strong>For lounge players:</strong> Check a room and Your lounge (both below).</li>
      </ul>
      <p>
        The On GameShuffle board only lists players who confirmed their lounge name. Switch it between
        Everyone, My friends (you and the people you follow), My crew and My country. It also shows
        who has climbed most since Monday.
      </p>

      <h3>Check a room</h3>
      <p>
        Open <strong>Check a room</strong>{" "}and paste the room&apos;s names, one per line or separated
        by commas. For a team format, put one team per line. Pick the game, the format (Free-for-all,
        2v2, 3v3, 4v4 or 6v6) and whose read it is under <strong>Read it for</strong>, then press{" "}
        <strong>Read the room</strong>.
      </p>
      <p>
        You get the room&apos;s average MMR, your seed, your likely finish, the place where you break
        even, what each place pays you, and every player or team by MMR with the favorite marked. The
        payouts are GameShuffle&apos;s estimate of the lounge&apos;s formula. If you&apos;re signed in,
        your last room is kept for six hours so <code>!odds</code>{" "}and the Tonight&apos;s room overlay
        piece can show it.
      </p>

      <h2>A player&apos;s page</h2>
      <p>
        A player&apos;s page wears their division&apos;s colors and emblem, with one line about their
        season. <strong>Compare</strong>{" "}opens a head-to-head with another player, and{" "}
        <strong>Share</strong>{" "}shares the page. The game pills only list the games they play in, and
        the <strong>Season</strong>{" "}picker opens any earlier season they played.
      </p>
      <p>The page has five tabs:</p>
      <ul>
        <li><strong>Overview:</strong> MMR, world rank and top %, season peak, events and win %, average score and the last ten events as squares. Then the next division with how fast they&apos;re getting there, the players near them in the world, the season chart and the last ten events.</li>
        <li><strong>Events:</strong> nights, formats, best and worst events, results by tier and free-for-all places. A night runs from 6am to 6am Pacific time, so events after midnight count with the evening before.</li>
        <li><strong>Teammates:</strong> every partner with their record and average score, and a head-to-head box.</li>
        <li><strong>How they play:</strong> how often they finish above where the room&apos;s MMR put them. With GS Pro you also see their rivals, how they do late in a night, by time of night and by day of the week, for any player.</li>
        <li><strong>Career:</strong> a chart of every season and a table season by season.</li>
      </ul>
      <p>
        When a table they played is submitted but not verified yet, the Overview says where they
        finished and about how much MMR it will move. A confirmed player with time trial times also
        gets a <strong>Time trials</strong>{" "}tab.
      </p>

      <h2>Confirm your lounge name</h2>
      <p>
        MKCentral keeps the Discord account of every lounge player, so confirming takes one tap and no
        codes.
      </p>
      <ol>
        <li>Link Discord to your GameShuffle account in <strong>Account &rsaquo; Settings &rsaquo; Sign-in &amp; security</strong>.</li>
        <li>On the <Link href="/lounge">lounge page</Link>, under <strong>Your lounge</strong>, press <strong>Confirm with Discord</strong>.</li>
      </ol>
      <p>
        GameShuffle confirms you in every game your Discord account plays. If it can&apos;t find you,
        register with MKCentral first, then press <strong>Check again</strong>. Once confirmed:
      </p>
      <ul>
        <li>Your page shows an On GameShuffle mark that links to your profile, and search engines can list it.</li>
        <li>You appear on the On GameShuffle boards.</li>
        <li>Your own page gets <strong>Share my latest night</strong>, a picture of your last lounge night with a link to your page.</li>
        <li>Discord servers can post your rank-ups and give you a division role (see below).</li>
      </ul>
      <p>GameShuffle checks confirmed players every 15 minutes.</p>

      <h2>Compare two players</h2>
      <p>
        Press <strong>Compare two players</strong>{" "}under the search, or <strong>Compare</strong>{" "}on
        a player&apos;s page. The head-to-head lists every event the two played together this season,
        as opponents and as teammates: their numbers side by side, then each meeting, newest first.
      </p>

      <h2>Twitch chat commands</h2>
      <p>
        These work once the GameShuffle bot is in your Twitch chat, which comes with{" "}
        <Link href="/help/getting-started/connecting-twitch">GS Pro&apos;s Twitch setup</Link>. With no
        name, a command reads your own lounge name from your <Link href="/mmr-card">MMR card</Link>.
        Anyone in chat can use them, in the game you have on stream, and each has a 15-second
        cooldown.
      </p>
      <ul>
        <li><code>!mmr [name]</code>: MMR, division, how far to the next one, world rank and tonight&apos;s run.</li>
        <li><code>!last10 [name]</code>: the last ten events, with the record, the MMR change, the best event and the average score.</li>
        <li><code>!avg [name]</code>: this season&apos;s average score and partner average.</li>
        <li><code>!tonight [name]</code>: tonight&apos;s events, record, MMR change and any new division. For you it counts from when you went live; for a name, from midnight Pacific.</li>
        <li><code>!compare &lt;name&gt; [name]</code>: two players side by side. With one name, it compares them with you.</li>
        <li><code>!h2h &lt;name&gt; [name]</code>: the head-to-head this season. With one name, it&apos;s against you.</li>
        <li><code>!lounge [name]</code>: a link to the player&apos;s lounge page.</li>
        <li><code>!odds</code>{" "}(GS Pro): the room you last checked on the lounge page tonight, with your seed, what a few places pay and the favorite.</li>
      </ul>

      <h2>In Discord</h2>
      <p>
        Lounge commands live on the{" "}
        <Link href="/help/competitive/competitive-discord-app">GameShuffle Competitive Discord app</Link>.
        They&apos;re free.
      </p>
      <ul>
        <li><code>/mmr</code>: a player&apos;s MMR. Leave the name out for your own MMR card. Add <code>versus</code>{" "}with a second name for a head-to-head.</li>
        <li><code>/room</code>: the room read for a pasted list of names. Separate team members with commas and teams with slashes.</li>
      </ul>
      <p>
        GameShuffle Competitive can also post lounge news for members who confirmed their lounge name.
        Set it in <strong>Account &rsaquo; Discord &rsaquo; Servers</strong>: pick GameShuffle
        Competitive at the top, then use the server&apos;s Mario Kart lounge settings.
      </p>
      <ul>
        <li><strong>Post rank-ups</strong>{" "}(free): a post when a member reaches a new division, once per division each season. It needs a channel picked under <strong>Posts go to</strong>.</li>
        <li><strong>Division roles follow</strong>{" "}(GS Pro): each member gets a role for their division in the game you pick, kept up to date every 15 minutes. The bot makes the roles (Iron to Grandmaster) the first time, so it needs the Manage Roles permission, with its own role above them.</li>
        <li><strong>Monday board covers</strong>{" "}(GS Pro): every Monday, a board of the server&apos;s confirmed members in the game you pick.</li>
      </ul>

      <h2>Still need help?</h2>
      <p>
        If MKCentral isn&apos;t answering, the pages say so; try again in a minute. For anything else,
        use the <Link href="/contact-us">contact form</Link>.
      </p>
    </HelpArticle>
  );
}
