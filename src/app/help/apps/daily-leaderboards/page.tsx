import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/apps/daily-leaderboards";
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
      <h1>Daily leaderboards and sharing</h1>
      <p>
        Four dailies have leaderboards: the <Link href="/daily">Daily Shuffle</Link>, the <Link href="/daily-dex">Daily Dex</Link>,{" "}
        <Link href="/daily-trivia">Fire Round</Link>{" "}and the <Link href="/daily-duel">Daily Duel</Link>. Each board has three tabs:{" "}
        <strong>Today</strong>, <strong>This week</strong>{" "}and <strong>This month</strong>. Days, weeks (Monday to Sunday) and months
        follow Pacific time, and only your first try at each daily each day counts. The{" "}
        <Link href="/help/apps/weekly-challenge">Weekly Challenge</Link>{" "}has its own leaderboard.
      </p>

      <h2>Points</h2>
      <ul>
        <li><strong>Daily Shuffle and Daily Dex:</strong> 10 points for a solve on guess 1, then 8, 6, 4 and 2 for guesses 2 to 5. A last-chance save scores 1, and a miss scores 0.</li>
        <li><strong>Fire Round:</strong> one point for every 200 you score in today&apos;s round, rounded up, up to 10.</li>
        <li><strong>Daily Duel:</strong> one point for every 100 of your score, up to 10. A Hard win can earn up to 12, and an Easy win up to 8.</li>
      </ul>

      <h2>Ties</h2>
      <p>
        On today&apos;s board, players level on points are ranked by solve time in the Shuffle and the Dex, by score in Fire Round, and by
        score, then time, in the Daily Duel. On the week and month boards, Fire Round and the Daily Duel break ties by total score, and
        Shuffle and Dex players level on points share a place.
      </p>

      <h2>Tokens and prizes</h2>
      <p>
        Every point you score earns GameShuffle tokens, and the end screen shows how many. When a week or month ends, the top 10 on each
        board win a prize, shown in the board&apos;s Prize column. Prizes are paid two days after the week or month ends (the board shows
        the date), and you get a notification when yours lands. A player on 0 points never wins one. More about tokens:{" "}
        <Link href="/help/streaming/token-economy">The Token Economy</Link>.
      </p>

      <h2>Playing as a guest</h2>
      <p>
        You don&apos;t need an account to play. To go on the boards as a guest, finish a game and use <strong>Put me on the board</strong>{" "}
        in the Leaderboard section: pick a name of 2 to 24 characters. From then on your games count like anyone&apos;s.
      </p>
      <p>
        Tokens you earn as a guest wait 30 days for a free account. Sign up or sign in on the same browser, and your guest games and tokens
        move to your account.
      </p>

      <h2>The marks beside names</h2>
      <ul>
        <li><strong>A plain picture:</strong> a signed-in player on GameShuffle.</li>
        <li><strong>A Discord badge:</strong> they played in the GameShuffle Activity in Discord.</li>
        <li><strong>A dashed ring:</strong> a guest.</li>
        <li><strong>A heart:</strong> they support GameShuffle.</li>
        <li><strong>Hard</strong>{" "}or <strong>Easy:</strong> the mode of their Daily Duel.</li>
        <li><strong>A bag:</strong> they used a tool in the Daily Duel.</li>
      </ul>
      <p>A key under each board explains the picture marks it shows.</p>

      <h2>Keeping your name off the boards</h2>
      <p>
        Turn off <strong>Show me on the Daily leaderboards</strong>{" "}in{" "}
        <strong>Account &rsaquo; Settings &rsaquo; Privacy</strong>. Your games still count for your streak and earn tokens. Each morning
        GameShuffle also posts yesterday&apos;s top 5 on its social accounts. Turn off <strong>Show me in winners videos</strong>{" "}in the
        same place to appear there as &ldquo;A player&rdquo;.
      </p>

      <h2>Sharing your result</h2>
      <p>
        When you finish, <strong>Share</strong>{" "}sends a picture card of your result with a link. The card shows things like your
        squares, time, streak and place, and never the answer. On a phone it opens your share sheet with a tall picture for stories, and on a computer it
        uses a wide card. Without a share sheet, a window opens with X, Facebook, Threads, Bluesky, WhatsApp, Reddit and Discord, plus{" "}
        <strong>Copy text</strong>{" "}and <strong>Save picture</strong>.
      </p>
      <p>
        With a public profile, the card shows your name and picture. A private profile, or a guest who hasn&apos;t put a name on the boards,
        gets a card without a name. When you&apos;ve finished two or more dailies today, Share asks whether to send just this one or all of
        today&apos;s dailies together.
      </p>

      <h2>Challenge links</h2>
      <p>
        Each card&apos;s link opens a page at <code>gameshuffle.co/r/</code>{" "}with a short code. Your friend sees your result, then plays
        today&apos;s game on the same page. When they finish, they see the two of you side by side, the leaderboard marks your row with{" "}
        <strong>Shared this</strong>, and their Share button offers to send theirs back to you. Sharing again the same day updates your card
        and keeps the same link.
      </p>

      <h2>Invite links</h2>
      <p>
        Each account has an invite link with a code that never changes, in <strong>Account &rsaquo; Invite friends</strong>. Results you
        share carry it, and so does your card&apos;s link. It pays in tokens:
      </p>
      <ul>
        <li>100 tokens when someone new finishes the Daily Shuffle, the Daily Dex or the Weekly from your link.</li>
        <li>500 more when they make a free account, and they get 250 extra tokens to start.</li>
      </ul>
      <p>
        Each person counts once, for the first link they used, and their browser remembers your link for 7 days. You&apos;re paid for up to
        10 players a day, and your own account, browser and network never count. Invite friends shows who played from your link and what
        it earned.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
