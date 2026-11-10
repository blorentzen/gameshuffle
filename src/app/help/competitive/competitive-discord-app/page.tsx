import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/competitive/competitive-discord-app";
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
      <h1>The GameShuffle Competitive Discord app</h1>
      <p>
        GameShuffle Competitive is our Discord bot for competitive Mario Kart: time trials, lounge MMR,
        room reads, wars and results. It&apos;s a separate app from the main GameShuffle bot, which keeps the
        daily games and community tools (see <Link href="/help/community/discord-bot">the Discord bot</Link>).
        Both can sit in the same server. Competitive is free; <code>/result</code>, division roles and the
        Monday board need GS Pro.
      </p>

      <h2>Adding it</h2>
      <h3>To a server</h3>
      <p>
        Use <a href="/discord/add?app=comp">Add GameShuffle Competitive</a>. Sign in or make a free
        GameShuffle account, then pick the server in Discord. You need permission to manage that server.
        A free account can add it to one server, and GS Pro to up to five. These count apart from the main
        bot&apos;s servers.
      </p>
      <h3>To your own account</h3>
      <p>
        Press <strong>Add to my apps</strong>{" "}on the <Link href="/time-trials/import">time trials import
        page</Link>. Then <code>/tt</code>, <code>/mmr</code>, <code>/room</code>, <code>/result</code>{" "}and
        Save to GameShuffle work for you in any server and in your DMs. The war commands only work in a
        server that has the app.
      </p>
      <p>
        Connect Discord to your GameShuffle account in{" "}
        <strong>Account &rsaquo; Settings &rsaquo; Sign-in &amp; security</strong>{" "}so the times you add and
        your own MMR card come from your account.
      </p>

      <h2>Time trials: /tt</h2>
      <ul>
        <li><code>/tt add</code>: add a time with its result screenshot, which is required. Leave the time out and the bot reads it from the screenshot, then press Add it. Options set the speed class, mushrooms, vehicle board and a clip link.</li>
        <li><code>/tt proof</code>: add a screenshot to a time you saved without one, such as an imported time.</li>
        <li><code>/tt track</code>: a track&apos;s top ten, this server&apos;s when it has times there or everyone&apos;s. Options pick the speed class, mushrooms, vehicle board and a country.</li>
        <li><code>/tt player</code>: a player&apos;s best times. Leave the name out for yours.</li>
        <li><code>/tt country</code>: set your country, or leave it out to see it.</li>
        <li><code>/tt panel</code>: post the time trial panel in this channel, with Add a time, Top ten, My times and Server board buttons. It stays up to date as times come in. For people who can manage the server.</li>
      </ul>
      <p>
        More on boards, proof and labels is in <Link href="/help/competitive/time-trials">Time trials</Link>.
      </p>

      <h2>Lounge: /mmr, /room and /result</h2>
      <ul>
        <li><code>/mmr</code>: a lounge player&apos;s MMR, division and rank. Leave the name out for your own <Link href="/help/competitive/mmr-card">MMR card</Link>. Add <code>versus</code>{" "}for a head-to-head, and <code>game</code>{" "}for Mario Kart World (Mario Kart 8 Deluxe if left out).</li>
        <li><code>/room</code>: paste the room&apos;s lounge names, separated by commas (teams separated by slashes). You get the room&apos;s average and who&apos;s favored. Add <code>me</code>{" "}with your lounge name for your seed, where you break even and what each place pays.</li>
        <li><code>/result</code>: posts the results of the last <Link href="/help/apps/competitive-lounge">Live scoring</Link>{" "}session you hosted on GameShuffle. Needs GS Pro and your Discord connected to your account.</li>
      </ul>

      <h2>Wars</h2>
      <p>These work in a server&apos;s channels.</p>
      <ul>
        <li><code>/war</code>: start a war against another team&apos;s tag and score it race by race on the war card. The channel remembers your tag, the game and how races go in.</li>
        <li><code>/cans</code>: post a war time for your team. Players tap Can, Sub, Maybe or Can&apos;t, and the captain locks the lineup. <code>/cans timezone</code>{" "}sets the time zone you type times in, <code>/cans setup</code>{" "}sets a team&apos;s role, and <code>/cans hours</code>{" "}opens the War room to mark the hours you can usually race.</li>
        <li><code>/race</code>: add or fix a race the way you&apos;d type it to another war bot: <code>12378</code>, <code>SSC 1-378</code>, <code>back</code>, <code>race 3 12378</code>, <code>pen 15 FRVR</code>.</li>
        <li><code>/table</code>: make a war table from this channel&apos;s last war, a results screenshot, or pasted text.</li>
        <li><code>/team</code>: this server&apos;s team cards: a team&apos;s name, every tag it plays under, its color, its players (in-game name, the name for tables, a flag), where its logo comes from, and its MKCentral team (<code>/team link</code>).</li>
        <li><code>/me</code>: your own war card: the name and flag tables show for you, your in-game names and your teams. Used in every server.</li>
        <li><code>/logo</code>: add, show, list or remove this server&apos;s team logos for war cards, tables and the overlay.</li>
        <li><code>/flag</code>: add, show, list or remove the server&apos;s own flags for war tables, for codes the country flags don&apos;t cover.</li>
      </ul>
      <p>
        Scoring, fixes, the overlay and the War room are in{" "}
        <Link href="/help/competitive/wars">Wars and the War room</Link>.
      </p>

      <h2>Save to GameShuffle</h2>
      <p>
        A message command for Quaxly&apos;s time trial list. Press and hold Quaxly&apos;s reply (right-click on
        a computer), tap Apps and pick <strong>Save to GameShuffle</strong>. Only you see the reply: how many
        new times it found, with a button to save them and <strong>Check them on GameShuffle</strong>{" "}to
        look them over first.
      </p>

      <h2>Settings and lounge posts</h2>
      <p>
        Go to <strong>Account &rsaquo; Discord &rsaquo; Servers</strong>{" "}and pick{" "}
        <strong>GameShuffle Competitive</strong>{" "}at the top. Each of your servers has:
      </p>
      <ul>
        <li><strong>Posts go to:</strong> the channel for the bot&apos;s posts.</li>
        <li><strong>Time trial panel:</strong> post it, move it, or take it down.</li>
        <li><strong>Mario Kart lounge:</strong> Post rank-ups (free) posts when a member who confirmed their lounge name reaches a new division, once a season. Division roles and the Monday board come with GS Pro.</li>
        <li><strong>Teams:</strong> each team&apos;s name, tags, color, logo and players for war cards and tables, with logos added many at once.</li>
      </ul>

      <h2>The old commands on the main bot</h2>
      <p>
        On the main GameShuffle bot, <code>/gs-tt</code>, <code>/gs-mmr</code>, <code>/gs-room</code>,{" "}
        <code>/gs-result</code>{" "}and Save to GameShuffle only reply with a note, which only you see, and an{" "}
        <strong>Add GameShuffle Competitive</strong>{" "}button. Use <code>/tt</code>, <code>/mmr</code>,{" "}
        <code>/room</code>{" "}and <code>/result</code>{" "}on Competitive. Times saved with <code>/gs-tt</code>{" "}are
        still on the boards. Lounge rank-ups, division roles and the Monday board now post only through
        Competitive.
      </p>
    </HelpArticle>
  );
}
