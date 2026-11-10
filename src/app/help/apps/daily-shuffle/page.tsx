import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/apps/daily-shuffle";
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
      <h1>The Daily Shuffle</h1>
      <p>
        <Link href="/daily">The Daily Shuffle</Link>{" "}is a daily puzzle: guess today&apos;s character from 130 across Nintendo,
        plus Smash&apos;s guests, and from November 21, 2026, a Sonic character on Saturdays. Everyone gets the same character
        each day, and a new one arrives at midnight Pacific time.
      </p>

      <h2>One big pool</h2>
      <p>
        Since October 15, 2026, every day draws from the same pool: every Smash Ultimate fighter, plus the Mario Kart and
        Mario Party characters Smash doesn&apos;t have. (Until then the game changed by the day: Mario Kart 8 Deluxe, Mario
        Kart World, Mario Party and Smash.) The days follow Pacific time (PT), so depending on where you live the new puzzle
        can arrive during your day rather than at your midnight.
      </p>

      <h2>Sonic Saturdays</h2>
      <p>
        From Saturday, November 21, 2026, Saturdays are a Sonic character: one of 47, from Sonic to the Deadly Six. The other
        six days stay on the big pool. There are no pictures on Sonic days, so you guess by name.
      </p>
      <ul>
        <li>Each guess shows the character&apos;s species, team, debut year and whether they race in Sonic Racing: CrossWorlds. A related species, or a debut within three years, counts as close.</li>
        <li>Before your first guess you get one of those for free: today&apos;s team, or whether they&apos;re in CrossWorlds.</li>
        <li>A written clue arrives after your second miss, and the game they first appeared in after your fourth.</li>
        <li>The last chance shows the name&apos;s first letter and how long it is, instead of a silhouette.</li>
      </ul>
      <p>Saturdays count toward your streak, stats and the leaderboards like any other day.</p>

      <h2>Starting the clock</h2>
      <p>
        The first hint and the guess box wait behind <strong>Start today&apos;s puzzle</strong>. Pressing it starts your time,
        and the end screen shows how long you took and whether it&apos;s your fastest. On the day&apos;s leaderboard, players
        level on points are ranked by their time.
      </p>

      <h2>How the hints work</h2>
      <p>
        A hint shows before your first guess, a nod to today&apos;s character that a fan might catch straight away. Each miss
        brings a new one, a little more specific: three nods, then the year and platform they debuted on, then the game they
        debuted in.
      </p>
      <p>Each guess also fills a row of facts about your guess, checked against today&apos;s character: their series, debut year, the console they debuted on, the first Smash game they were playable in, and the first Mario Kart they raced in (or Never).</p>
      <p>
        A green cell is a match and a yellow cell is close: a debut within three years, the same console generation, or the
        game just before or after in the series.
      </p>

      <h2>Five guesses and a last chance</h2>
      <p>
        You have five guesses. Miss them all and you get a last chance: the answer&apos;s silhouette and one more guess. Get it
        then and your streak keeps going, but it doesn&apos;t count as a win, and your stats show it as a save.
      </p>

      <h2>Sharing and streaks</h2>
      <p>When you&apos;re done, <strong>Share</strong> sends a picture card of your result with a spoiler-free grid and a link; a last-chance save ends with a ring buoy. The <Link href="/help/apps/daily-leaderboards">daily leaderboards article</Link>{" "}covers sharing in full. Your streak counts every day you solve, last-chance saves included. Signed in, your results are saved to your account, so your streak follows you to any device and shows on your profile. Signed out, your streak and stats stay in the browser you play on.</p>

      <h2>Play in Discord</h2>
      <p>
        The Daily also runs inside Discord as an Activity, so a whole server can play together. Start it from the App Launcher
        (the rocket in the message bar), with <code>/gs-daily</code>, or with the <strong>Play the Daily</strong>{" "}button on the
        day&apos;s card. You don&apos;t need a GameShuffle account to play there.
      </p>
      <ul>
        <li>When the GameShuffle bot is in the server, the channel gets one card for the day showing everyone&apos;s rows as colored squares (no answers), and each player&apos;s score once they finish.</li>
        <li>At 9am Pacific the bot posts yesterday&apos;s ranking for that channel and how many days in a row the channel has solved it.</li>
        <li>If your Discord is linked to your GameShuffle account, your Discord games count toward the same streak and stats. It&apos;s still one result per day: if you play on both, the one on the site counts.</li>
      </ul>
      <p>More about the bot and the Activity: <Link href="/help/community/discord-bot">the Discord Bot</Link>.</p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
