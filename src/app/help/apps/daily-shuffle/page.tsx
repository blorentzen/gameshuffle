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
  openGraph: { title: `${meta.title} | GameShuffle Help`, description: meta.description, url: `https://www.gameshuffle.co${HREF}` },
  robots: { index: true, follow: true },
};

export default function Page() {
  return (
    <HelpArticle href={HREF}>
      <h1>The Daily Shuffle</h1>
      <p>
        <Link href="/daily">The Daily Shuffle</Link> is a daily puzzle: guess today&apos;s character in six tries. Everyone gets
        the same character each day, and a new one arrives at midnight UTC.
      </p>

      <h2>A different game each day</h2>
      <ul>
        <li><strong>Mario Kart 8 Deluxe:</strong> Sunday, Monday and Thursday.</li>
        <li><strong>Mario Kart World:</strong> Tuesday and Friday.</li>
        <li><strong>Mario Party:</strong> Wednesday and Saturday (the Jamboree roster).</li>
      </ul>
      <p>The days follow UTC, so depending on where you live the switch can happen in the evening.</p>

      <h2>How the hints work</h2>
      <ul>
        <li><strong>Weight class</strong> (Mario Kart days): green if your guess matches the answer&apos;s.</li>
        <li><strong>Group</strong> (every day): green if it&apos;s in the same group, like Mario family, Bowser&apos;s crew or Babies.</li>
        <li><strong>Superstars</strong> (Mario Party days): green if your guess matches on whether the character is also in Mario Party Superstars.</li>
        <li><strong>A to Z:</strong> whether the answer comes earlier or later in the alphabet than your guess.</li>
      </ul>

      <h2>Sharing and streaks</h2>
      <p>When you&apos;re done, <strong>Copy my result</strong> gives you a spoiler-free grid to share. Your streak counts every day you solve, whatever the game. Signed in, your results are saved to your account, so your streak follows you to any device and shows on your profile. Signed out, your streak and stats stay in the browser you play on.</p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
