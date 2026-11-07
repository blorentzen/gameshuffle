import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/streaming/stream-hub";
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
      <h1>The stream hub</h1>
      <p>
        The <Link href="/hub">stream hub</Link>{" "}is where you plan your streams, run them while you&apos;re live and look back
        on them after. It&apos;s part of GS Pro. Your Twitch connection, Discord bot, overlay and chat commands are set up in{" "}
        <strong>Account &rsaquo; Streaming</strong>, which <strong>Stream settings</strong>{" "}at the top of the hub opens.
      </p>

      <h2>The hub page</h2>
      <ul>
        <li><strong>Setup warnings:</strong> if Twitch isn&apos;t connected, the bot can&apos;t post in your chat, or GameShuffle isn&apos;t hearing everything from Twitch, a warning at the top says so, with a link to fix it.</li>
        <li><strong>Live now:</strong> a card for each stream that&apos;s on, with the game, how long you&apos;ve been live, how many are in the lobby and whether picks and bans are open. <strong>Live page</strong>{" "}opens your public page and <strong>Open control room</strong>{" "}opens the stream.</li>
        <li><strong>Coming up:</strong> streams you&apos;ve scheduled, and a draft you haven&apos;t scheduled yet.</li>
        <li><strong>This month:</strong> streams, viewers who played and rolls, counted by the Pacific calendar month.</li>
        <li><strong>Past streams:</strong> every finished or cancelled stream with its game, date, length and viewers who played. Search them by name, show test streams, and load more 25 at a time.</li>
        <li><strong>Test stream:</strong> the button beside New stream opens a practice stream. It works like a real one, but it never ends or wraps up on its own, and it stays out of your past streams unless you show test streams.</li>
      </ul>

      <h2>New streams</h2>
      <p>
        Go live on Twitch in a game GameShuffle supports and a stream opens in the hub on its own. To set one up ahead of
        time, press <strong>New stream</strong>, give it a title (and a description and games if you like), and press{" "}
        <strong>Create draft</strong>. You set the games, the schedule and picks and bans on the stream&apos;s own page.
      </p>
      <p>
        You can have one draft at a time. If you already have one, the hub offers to open it. Schedule it, start it or cancel
        it to make another.
      </p>

      <h2>One page per stream</h2>
      <p>Each stream has one page, and its tabs change with where the stream is.</p>

      <h3>Before the stream</h3>
      <ul>
        <li><strong>Plan:</strong> a checklist (name, games, when, where it&apos;s announced) and the stream&apos;s settings, including the schedule. A scheduled stream opens and announces itself when the time comes. Twitch chat always gets the announcement, and your Discord server does once it&apos;s connected.</li>
        <li><strong>Games:</strong> settings for each game, plus the GS Queue for any other game: how many viewers it holds at once (20 unless you change it) and whether they play first in, first out or at random.</li>
      </ul>
      <p>
        The buttons at the top start the stream now or cancel it. <strong>Invite people you follow</strong>{" "}lets you pick people you
        follow on GameShuffle and sends each of them an invite to your live page.
      </p>

      <h3>While you&apos;re live</h3>
      <ul>
        <li><strong>Control room:</strong> see below.</li>
        <li><strong>Lobby:</strong> everyone who&apos;s joined, with a kick button, whether the lobby shows on your live page, and the chat commands viewers use to join.</li>
        <li><strong>Picks &amp; bans:</strong> rounds of track picks and bans, with what&apos;s leading so far. Mario Kart 8 Deluxe and Mario Kart World only.</li>
        <li><strong>Live games:</strong> <Link href="/help/streaming/polls">polls</Link>, <Link href="/help/streaming/stream-bingo">Stream Bingo</Link>, <Link href="/help/streaming/chat-draft">Chat Draft</Link>, <Link href="/help/streaming/chat-brain">Chat Brain</Link>{" "}and <Link href="/help/streaming/break-mode">break mode</Link>.</li>
        <li><strong>Predictions</strong>{" "}for Mario Kart, where chat bets <Link href="/help/streaming/token-economy">tokens</Link>{" "}on how a race goes, plus bounties. Other games get a <strong>Bounties</strong>{" "}tab.</li>
        <li><strong>Games</strong>, <strong>Activity</strong>{" "}(everything that happened) and <strong>Settings</strong>.</li>
      </ul>
      <p>
        <strong>End stream</strong>{" "}at the top ends it, and <strong>Mod view</strong>{" "}opens the page your mods use. If your
        stream goes offline, the page counts down to when the stream ends on its own, unless you go live again first.
      </p>

      <h3>After the stream</h3>
      <ul>
        <li><strong>Recap:</strong> viewers who played, rolls, picks and bans rounds, ballots, what happened, and the tokens handed out.</li>
        <li><strong>Activity:</strong> the full list of what happened.</li>
      </ul>
      <p>
        <strong>Public recap</strong>{" "}opens the recap anyone can see. <strong>Write it up with AI</strong>{" "}drafts a post for
        Discord and a short one for X or Bluesky, for you to edit and copy. See{" "}
        <Link href="/help/apps/ai-tools">AI tools</Link>. <strong>Restart</strong>{" "}makes a new stream with the same settings.
      </p>

      <h2>The control room</h2>
      <p>
        The control room only shows what the game on stream can do. Change your Twitch category and the page switches its
        rolls, cards and tabs to the new game.
      </p>

      <h3>Rolls</h3>
      <ul>
        <li><strong>Your pick</strong>{" "}for the game, like <strong>Roll my fighter</strong>, with a choice where the game has one (a hero role, a Pokémon Stadium cup).</li>
        <li><strong>Match setup:</strong> <strong>Roll the setup</strong>{" "}picks what everyone plays on, like a Smash stage and rules or a Mario Party board.</li>
        <li><strong>Viewer battle:</strong> rolls everyone in the lobby at once. It needs 2 in the lobby.</li>
        <li><strong>Race</strong>{" "}in Mario Kart: roll a race (or a set of races), or just a new track or new items.</li>
      </ul>
      <p>
        Every roll posts in your chat and shows on your overlay. <strong>Last roll</strong>, beside the rolls, shows the latest
        one in this game. When nothing on stream can be rolled, the stream runs as a queue: viewers join with{" "}
        <code>!gs-join</code>{" "}and play in order.
      </p>

      <h3>Running now</h3>
      <p>
        A card for each thing that&apos;s running, such as a picks and bans round, a poll, Stream Bingo, a Chat Draft, a Chat
        Brain game, a break, a prediction, a bounty or a challenge. Each card has its next step, like{" "}
        <strong>Close the poll</strong>{" "}or <strong>Call a number</strong>, and <strong>Open</strong>{" "}for the full controls.
        The <strong>Start</strong>{" "}row below the cards starts anything else this game can run.
      </p>

      <h3>Overlay tools</h3>
      <p>
        Pick a tool (wheel, dice, coin, 8-ball, raffle, timer, bingo board or tier list) and run it on your overlay from here.
        The hub remembers the last tool you picked. <strong>Set them up</strong>{" "}opens{" "}
        <strong>Account &rsaquo; Streaming &rsaquo; Overlay &rsaquo; Tool looks</strong>.
      </p>
      <p>The lobby and the latest activity sit beside it all.</p>

      <h2>What Full-access mods see</h2>
      <p>
        A mod with <Link href="/help/streaming/mods">Full access</Link>{" "}gets the same control room on their mod page while
        you&apos;re live: the rolls, Running now and the overlay tools, plus the Picks &amp; bans and Live games tabs.
        Predictions and bounties, starting, ending and editing the stream, and the Settings tab stay with you.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
