import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/apps/goldeneye-randomizer";
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
      <h1>The GoldenEye 007 randomizer</h1>
      <p>
        The <Link href="/randomizers/goldeneye-007">GoldenEye 007 randomizer</Link>{" "}sets up a multiplayer match for two to four
        players: the scenario, the map, the weapons and how long it lasts, plus a different character for everyone. It&apos;s
        new, so some parts may still change.
      </p>

      <h2>Roll the match</h2>
      <p>
        Press <strong>Roll the match</strong>. The scenario comes first (like Normal, You Only Live Twice, The Man with the Golden
        Gun or a team game), then a map that fits your player count, a weapon set and a game length that suits the scenario.
      </p>
      <p>
        Each part has its own refresh button, so you can change just the map or just the weapons. A new scenario only changes
        the weapons or length if the old ones don&apos;t work with it: The Man with the Golden Gun always uses the Golden Gun,
        You Only Live Twice always runs until one player is left, and The Living Daylights (flag tag) is played on time, never to a points target.
      </p>

      <h2>Pick everyone&apos;s character</h2>
      <p>
        Characters roll separately, so re-rolling the match never changes them. Press <strong>Randomize Characters</strong>,
        or <strong>Refresh Character</strong> on one player. Choose <strong>Main characters</strong> (Bond, Natalya and the
        villains) or <strong>Additional characters</strong> (the soldiers, guards and other extras). On team scenarios the
        teams show on each player&apos;s card.
      </p>

      <h2>Options</h2>
      <ul>
        <li><strong>New save only:</strong> just the six maps and eight characters open on a fresh save file.</li>
        <li><strong>No Oddjob:</strong> on by default. He&apos;s the shortest character, so auto-aim shoots over his head; most groups ban him.</li>
        <li><strong>Team scenarios:</strong> allows 2 vs 2, 3 vs 1 and 2 vs 1.</li>
        <li><strong>Random handicaps</strong> and <strong>A random cheat:</strong> for a chaos night.</li>
      </ul>
      <p>
        Or type it: &quot;three of us, chaos night, no Oddjob&quot; in <strong>Describe your night</strong> sets the options for
        you. See <a href="/help/apps/ai-tools">AI tools</a>.
      </p>

      <h2>Sharing it</h2>
      <p><strong>Copy match</strong> gives you the whole match and everyone&apos;s character as text for chat or Discord.</p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
