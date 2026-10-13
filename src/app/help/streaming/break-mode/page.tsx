import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/streaming/break-mode";
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
      <h1>Break mode</h1>
      <p>
        Step away from your stream and GameShuffle keeps chat playing. Break mode puts a break screen on your overlay and runs
        quick games one after another: chat answers by typing, rounds move on by themselves, and a break champion is named
        when you&apos;re back. It&apos;s a GameShuffle Pro feature.
      </p>

      <h2>Start a break</h2>
      <ul>
        <li>In chat, type <code>!gs brb</code>, or <code>!gs brb 10</code> to show &ldquo;back in about 10 minutes&rdquo; on screen. Your mods can start one too.</li>
        <li>Or use <strong>Streaming &gt; Live games &gt; Break mode</strong>, or the <strong>Live games</strong> tab on your stream page, and press <strong>Start break</strong>.</li>
      </ul>
      <p>The minutes only set the &ldquo;back in about&rdquo; line. The break keeps going until you come back.</p>

      <h2>Come back</h2>
      <ul>
        <li><code>!gs back</code> or <strong>I&apos;m back</strong> in your control room lets the round in play finish (a minute at most), then names the break champion in chat and on screen.</li>
        <li><code>!gs back now</code> or <strong>End now</strong> ends it straight away.</li>
        <li>A break also ends when your stream goes offline, and after 90 minutes if nobody ends it.</li>
      </ul>

      <h2>The games</h2>
      <p>Pick which ones play, and in what order, under <strong>Lineup</strong> on the Break mode screen. The lineup loops until you&apos;re back.</p>
      <ul>
        <li><strong>Higher or Lower:</strong> two characters, which is heavier or came first. Chat types <code>1</code> or <code>2</code>.</li>
        <li><strong>Odd One Out:</strong> four characters, one doesn&apos;t belong. <code>1</code> to <code>4</code>.</li>
        <li><strong>Fact or Fiction:</strong> a statement about a character. <code>T</code> or <code>F</code>.</li>
        <li><strong>Closest Guess:</strong> the year a character first appeared. The closest guesses score.</li>
        <li><strong>Scramble:</strong> a character&apos;s name with the letters mixed up. Type the name.</li>
        <li><strong>Over or Under:</strong> call two dice before they roll: <code>over</code>, <code>under</code> or <code>7</code> (exactly 7 pays most).</li>
        <li><strong>Lucky Number:</strong> pick a number from 1 to 100; closest to the roll wins.</li>
        <li><strong>High Roller:</strong> everyone who types <code>roll</code> gets two dice. Highest wins.</li>
        <li><strong>Handicap Vote:</strong> chat picks your handicap for the first game back, like playing standing up or no drifting in Mario Kart.</li>
        <li><strong>Tier War Live:</strong> chat ranks six things from one topic, one at a time: <code>S</code>, <code>A</code>, <code>B</code>, <code>C</code> or <code>D</code>. Match the room to score; the finished list shows at the end.</li>
        <li><strong>Shuffle Dice:</strong> chat plays our dice game against the house. After each roll chat types <code>roll</code> or <code>bank</code>; three Bombs lose the turn. First to 25 wins.</li>
        <li><strong>Roll Call:</strong> the randomizer rolls three options for your next pick in the game you&apos;re streaming, and chat calls which one it lands on.</li>
        <li><strong>Chat Picks Your Next Build:</strong> in Mario Kart or Smash, chat votes your next kart combo or fighter one part at a time.</li>
        <li><strong>Stream Bingo:</strong> bingo that runs itself: cards on your live page for a minute, a number every 10 seconds, first line wins. Up to 5 minutes, so it&apos;s not in the lineup until you add it.</li>
        <li><strong>Read the Room:</strong> a this-or-that question. Chat types <code>1</code> or <code>2</code>, and everyone who picked what most of chat picked scores.</li>
        <li><strong>Zoomed In:</strong> a close-up of a character that zooms out every 8 seconds. One guess each: the sooner you name it, the more you score.</li>
        <li><strong>Emoji Puzzle:</strong> a game told in emoji. Type the game.</li>
        <li><strong>Trivia:</strong> questions from the GameShuffle trivia pack. Type your answer, or a letter when there are choices.</li>
        <li><strong>Chat Brain:</strong> chat answers a Chat Brain question. Answers stay private and help build the boards; everyone who answers scores.</li>
        <li><strong>Roster Rush:</strong> chat names every character on a roster together. Every name you get right scores, and naming them all gives everyone a bonus.</li>
        <li><strong>Item Box Royale:</strong> everyone who types <code>join</code> is in, then items knock players out a few at a time until one is left. Nothing to type after joining: just watch.</li>
        <li><strong>Four in a Row:</strong> chat votes a column each move against GameShuffle. A full game can take several minutes, so it&apos;s not in the lineup until you add it.</li>
        <li><strong>Know the Channel:</strong> questions about your channel that you and your mods write (or draft with AI from a short questionnaire and then keep the good ones). Add them under <strong>Know the Channel</strong> on the Break mode screen. It skips itself until there are some.</li>
        <li><strong>Chat Sets the Bounty:</strong> chat votes on a challenge for your next game, like winning the next race without items. If you pull it off, everyone who voted for it splits the bounty, paid in tokens from your monthly allowance. Pick the amount under <strong>Bounty</strong> on the Break mode screen (off until you do). When you&apos;re back, mark it <strong>Did it</strong> or <strong>Didn&apos;t</strong> in your control room.</li>
        <li><strong>Boss Fight:</strong> chat against a boss with a health bar. Everyone types <code>hit</code> each round; one hit in eight is a critical. The more of chat joins in, the more health the boss has. Beat it in five rounds and everyone who hit it scores.</li>
        <li><strong>Five Letters:</strong> chat works out a five-letter gaming word together, with a clue like &ldquo;A character&rdquo;. Each round the word most of chat typed is played and every letter shows whether it&apos;s in the right spot, somewhere else in the word, or not in it. Six guesses.</li>
        <li><strong>Game Trivia:</strong> questions about the game you&apos;re streaming, from packs GameShuffle writes and checks. Until your game has a pack it asks general gaming questions.</li>
        <li><strong>Kart Derby:</strong> chat picks a lane from 1 to 8 (or types <code>join</code> for any lane), then the race plays out on screen over three laps, with boosts, banana peels and shells. Everyone in the lanes that finish first, second and third scores. In a busy chat each lane is a team.</li>
      </ul>
      <p>
        New games join your lineup on their own. To leave one out, untick it on the Break mode screen.
      </p>
      <p>
        What chat picks or calls for your next game (a build, a roll, a handicap) shows on the break screen and in chat when
        you&apos;re back.
      </p>
      <p>
        Questions come from the facts behind our Daily, and lean toward the game you&apos;re streaming. Nothing repeats on your
        channel within 30 days.
      </p>

      <h2>How viewers play</h2>
      <p>
        Viewers type their answer in chat while a round is open: no command needed. Their latest answer counts (Zoomed In keeps your first guess, and Roster Rush counts every name; in Boss Fight one hit a round is all it takes), and the bot stays
        quiet until the round ends, then says the answer once. Everyone who&apos;s right scores, so nobody wins just by typing
        fastest, and answers keep counting for a few seconds after the countdown because viewers see your stream a little late.
        Viewers on their phones can also tap their answer on your <code>/live</code>{" "}page.
      </p>

      <h2>Show it on stream</h2>
      <p>
        Add the <strong>Break screen</strong> piece in Overlay Layout (under Apps; see <Link href="/help/streaming/obs-overlay">the OBS overlay</Link>) and place it on
        your own BRB scene. If you don&apos;t have a BRB scene, set <strong>Show the break as</strong> to full screen on the Break
        mode screen and it covers the whole overlay. It runs while your overlay or live page is open.
      </p>

      <h2>A question that&apos;s wrong</h2>
      <p>
        If a question is wrong or doesn&apos;t sit right, you or a mod can type <code>!gs pull</code> (or press <strong>Pull this
        question</strong>). The break skips to the next round, and the question stays off every channel until our team checks it.
      </p>
    </HelpArticle>
  );
}
