import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/streaming/level-queue";
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
      <h1>Level queue and Levels</h1>
      <p>
        Viewers send you levels from chat, and you play them on stream: Super Mario Maker 2 course IDs, Fortnite island
        codes (Creative and UEFN), Fall Guys share codes and Geometry Dash level IDs. The level queue is part of GS
        Pro. Each game&apos;s Levels board, where players share their best, is free, and so is the Seeds board for
        Minecraft.
      </p>

      <h2>Run the queue</h2>
      <p>
        Open <strong>Streaming ▸ Live games ▸ Level queue</strong>, or the Live games tab on your stream page, and press
        <strong>Open the queue</strong>. You can also type <code>!level open</code> in chat.
      </p>
      <ul>
        <li><strong>Next</strong> brings up the first level in line. <strong>Random</strong> picks any level in line.</li>
        <li>When you finish a level, mark it <strong>Cleared</strong>, <strong>Skipped</strong> or <strong>Gave up</strong>. You can change it later under Played this stream.</li>
        <li><strong>Close the queue</strong> stops new levels. Levels already in line stay in line.</li>
      </ul>

      <h2>Which game it takes</h2>
      <p>
        The queue follows your Twitch category: when you&apos;re streaming Super Mario Maker 2, Fortnite, Fall Guys or
        Geometry Dash, it takes that game&apos;s codes. In any other category it uses the game you pick on the dashboard. A level sent
        for another game waits and comes back when that game is on stream.
      </p>

      <h2>Chat commands</h2>
      <ul>
        <li><code>!add XXX-XXX-XXX</code> sends a level. Viewers get one level each in line, and a level played this stream can&apos;t be sent again.</li>
        <li><code>!position</code> says where your level is. <code>!remove</code> takes it out.</li>
        <li>You and your mods: <code>!level next</code>, <code>!level random</code>, <code>!level skip</code>, <code>!level open</code>, <code>!level close</code> and <code>!level clear</code>. Add a result to <code>!level next</code> to finish the level being played, as in <code>!level next cleared</code> or <code>!level next gaveup</code>. Mods can take out someone&apos;s level with <code>!remove @name</code>.</li>
      </ul>
      <p>
        If your channel already has its own <code>!add</code>, <code>!position</code> or <code>!remove</code> command,
        yours keeps answering. You can switch ours off on <Link href="/help/streaming/chat-commands">the Commands page</Link>.
      </p>

      <h2>Codes we check</h2>
      <p>
        Super Mario Maker 2 course IDs carry a check of their own, so GameShuffle catches most typos before a level gets
        in line, and tells viewers when they sent a maker ID instead of a course ID. A mistake in the first two
        characters can&apos;t be caught, because the check doesn&apos;t cover them. Fortnite island codes and Fall Guys
        share codes are 12 numbers, so we check the format; a play.fn.gg or fortnite.com link works too. Geometry Dash
        level IDs are the number on the level&apos;s info.
      </p>

      <h2>On your overlay</h2>
      <p>
        Turn on the <strong>Level queue</strong> piece under Apps in your overlay layout (see{" "}
        <Link href="/help/streaming/obs-overlay">the OBS overlay</Link>). It shows the level being played with its code
        and who sent it, the next three in line, and how to join.
      </p>

      <h2>A thank-you for the sender</h2>
      <p>
        Under Settings you can give the sender some tokens when you clear or give up on their level. They come out of
        your monthly token allowance. Nothing is paid for a skip, and nothing is ever paid for likes or favorites.
      </p>

      <h2>The Levels board</h2>
      <p>
        Each game&apos;s space has a Levels tab where players share levels with a name and up to four tags. Sharing needs
        a free account. Each level&apos;s card says where it was played on stream and how it went.
      </p>
      <ul>
        <li><strong>Likes and how it went:</strong> with a free account, like a level and say how it went: I cleared it, I gave up, or the code didn&apos;t load. One of each per level, and you can change it. Nothing pays tokens.</li>
        <li><strong>Difficulty:</strong> once five players (streams included) have said how a level went, its card shows how many cleared it, like &quot;Cleared by 4 of 18&quot;. Until then the tags say how hard it is.</li>
        <li><strong>May not work:</strong> two players saying the code didn&apos;t load mark a level &quot;May not work&quot;, and it leaves Top this week and Streamers&apos; picks. The next clear takes the mark off.</li>
        <li><strong>Sorts:</strong> Top this week (likes in the last 7 days), Streamers&apos; picks (cleared on two or more streams), Newest, Hardest (fewest clears for the players who tried) and Lists.</li>
        <li><strong>GameShuffle picks and the level of the week:</strong> GameShuffle pins up to six picks for each game with a line on why, and picks a level of the week from the week&apos;s most liked. Both lead the board and the space&apos;s Now tab, and the maker hears about it.</li>
        <li><strong>Lists:</strong> make a list of up to 20 levels, public or only for you. Add a level from its menu.</li>
        <li><strong>Report:</strong> a level&apos;s menu can report it for the wrong game, offensive words or spam. When three players report a level, it comes off the board until staff look.</li>
      </ul>

      <h2>From the board to your queue</h2>
      <p>
        With GS Pro, any level&apos;s menu on a board has <strong>Add to my queue</strong>, and a list&apos;s menu has{" "}
        <strong>Queue this list</strong>{" "}for a level night. They follow the queue&apos;s rules: one level for each player
        who shared them, never a level already in line or played this stream, and a level for another game waits until
        that game is on stream.
      </p>
      <p>
        When you mark Cleared on a level a viewer sent from chat, and their Twitch is linked to a GameShuffle account,
        they get a notification offering to share it on the board. It&apos;s only shared if they do.
      </p>

      <h2>Makers</h2>
      <p>
        The levels you share show on your profile with their likes and clears, and people who follow you hear when you
        share one. Add your Super Mario Maker 2 maker ID under <strong>Account ▸ Profile ▸ Gamertags &amp; socials</strong>{" "}
        and it shows on your courses.
      </p>

      <h2>Minecraft seeds</h2>
      <p>
        The Minecraft space has a Seeds board: the seed, Java or Bedrock, the version, a note and up to five places worth
        seeing with their coordinates. Seeds have likes, GameShuffle picks, lists and reports, like levels.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
