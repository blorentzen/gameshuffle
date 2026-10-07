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
        <Link href="/daily">The Daily Shuffle</Link>{" "}is a daily puzzle: guess today&apos;s character in six tries. Everyone gets
        the same character each day, and a new one arrives at midnight Pacific time.
      </p>

      <h2>A different game each day</h2>
      <ul>
        <li><strong>Mario Kart 8 Deluxe:</strong> Sunday and Monday (and Thursday until October 8, 2026).</li>
        <li><strong>Mario Kart World:</strong> Tuesday and Friday.</li>
        <li><strong>Mario Party:</strong> Wednesday and Saturday (the Jamboree roster).</li>
        <li><strong>Smash Ultimate:</strong> Thursday, starting October 15, 2026 (all 86 fighters).</li>
      </ul>
      <p>The days follow Pacific time (PT), so depending on where you live the switch can happen during your day rather than at your midnight.</p>

      <h2>How the hints work</h2>
      <p>Each guess fills a row of facts about your guess, checked against today&apos;s character:</p>
      <ul>
        <li><strong>Mario Kart days:</strong> weight class, species, the series they first appeared in, their debut year and their Mario Kart debut.</li>
        <li><strong>Mario Party days:</strong> species, first series, debut year, Mario Party debut, and whether they&apos;re in Mario Party Superstars.</li>
        <li><strong>Smash days:</strong> series, the first Smash game they were playable in, debut year, weight class, and whether they&apos;re a third-party guest.</li>
      </ul>
      <p>
        Before your first guess you get one of those columns free: the starter clue. It&apos;s always a broad one (weight class,
        series, Superstars, or first Smash game), never an exact year, and it&apos;s the same for everyone that day.
      </p>
      <p>
        A green cell is a match. Years within three of the answer show as close, and arrows point toward the answer (an up
        arrow on weight class means the answer is heavier). After your third guess a written clue unlocks, and for your last
        two guesses you also see the answer&apos;s silhouette.
      </p>

      <h2>Sharing and streaks</h2>
      <p>When you&apos;re done, <strong>Copy my result</strong> gives you a spoiler-free grid to share. Your streak counts every day you solve, whatever the game. Signed in, your results are saved to your account, so your streak follows you to any device and shows on your profile. Signed out, your streak and stats stay in the browser you play on.</p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
