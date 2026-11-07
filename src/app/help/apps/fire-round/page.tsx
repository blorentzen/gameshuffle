import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/apps/fire-round";
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
      <h1>Fire Round</h1>
      <p>
        <Link href="/daily-trivia">Fire Round</Link>{" "}is GameShuffle&apos;s daily trivia quiz: answer as many questions as you can before
        the clock runs out. One round a day counts on the leaderboard, and rounds by category are open any time. You don&apos;t need an
        account to play.
      </p>

      <h2>Today&apos;s round</h2>
      <p>
        Today&apos;s Fire Round is 60 seconds of mixed questions, the same ones in the same order for everyone. A new round starts at
        midnight Pacific time. The first round you start each day is the one that counts. After that,{" "}
        <strong>Practice today&apos;s round</strong>{" "}plays it again without changing your score on the board.
      </p>

      <h2>Answering</h2>
      <ul>
        <li><strong>Type it:</strong> a typed answer scores 100, and small typos are forgiven. When your answer is close but not exact, the four choices open so you can pick the exact one.</li>
        <li><strong>Show 4 choices:</strong> open the choices any time. A right choice scores 40.</li>
        <li><strong>Skip:</strong> move on to the next question for no points.</li>
      </ul>
      <p><strong>Stop and keep my score</strong>{" "}ends the round early.</p>

      <h2>Heat</h2>
      <p>
        Right answers in a row heat your score up. After three right in a row, each right answer is worth 1.5 times as much, and after six,
        twice as much. A wrong answer or a skip resets it.
      </p>

      <h2>More rounds, any time</h2>
      <p>Under <strong>More rounds, any time</strong>, pick a category and a length, then <strong>Start a round</strong>.</p>
      <ul>
        <li><strong>1 minute</strong>, <strong>3 minutes</strong>{" "}or <strong>5 minutes</strong>: answer until the clock runs out.</li>
        <li><strong>Until 3 misses</strong>: no clock and three hearts. A wrong answer or a skip costs a heart.</li>
      </ul>
      <p>
        Questions you&apos;ve had in the last 30 days come last. A category shows once it has enough questions ready, and the holiday
        categories only appear in their month: Halloween in October, Christmas in December. The page keeps your best score for each
        category and length.
      </p>

      <h2>Leaderboard and streak</h2>
      <p>
        Today&apos;s round goes on the Fire Round leaderboard: one point for every 200 you score, rounded up, up to 10. Today&apos;s board
        shows each player&apos;s score and how many they got right. Your streak counts the days in a row you&apos;ve played today&apos;s
        round. As a guest, put a name on the board after your round for it to count. Prizes, guests and sharing are on{" "}
        <Link href="/help/apps/daily-leaderboards">Daily leaderboards and sharing</Link>.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
