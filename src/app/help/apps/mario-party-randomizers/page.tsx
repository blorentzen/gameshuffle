import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/apps/mario-party-randomizers";
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
      <h1>The Mario Party randomizers</h1>
      <p>
        Roll the board, the rules, the characters and the minigames for a Mario Party night. There&apos;s one for each game:
      </p>
      <ul>
        <li><Link href="/randomizers/super-mario-party-jamboree">Super Mario Party Jamboree</Link>, including the Switch 2 Edition&apos;s extra rules and minigames.</li>
        <li><Link href="/randomizers/mario-party-superstars">Mario Party Superstars</Link>: five classic boards and 100 minigames.</li>
        <li><Link href="/randomizers/mario-party">Mario Party</Link>, <Link href="/randomizers/mario-party-2">Mario Party 2</Link> and <Link href="/randomizers/mario-party-3">Mario Party 3</Link>, as played on Nintendo Switch Online + Expansion Pack (new).</li>
      </ul>

      <h2>Tell it what you have</h2>
      <p>
        Haven&apos;t unlocked every board or character yet? Use <strong>Choose what I have</strong> at the top of the page and
        rolls skip the rest. On Jamboree you also pick your version (Nintendo Switch or Switch 2 Edition). Signed in, your
        collection is saved to your account; signed out, it stays in your browser.
      </p>

      <h2>Board Randomizer</h2>
      <ol>
        <li>Press <strong>Roll the setup</strong>. You get a board, a ruleset (like Party Rules or Pro Rules), a turn count and a Bonus Star mode.</li>
        <li>Tap the <strong>lock</strong> beside any part to keep it, then <strong>Roll again</strong> for the rest. A locked part never changes, and if the new rules can&apos;t use a locked turn count, it&apos;s rolled to one that fits.</li>
        <li>Use <strong>Change options</strong> to choose which boards and rules can come up.</li>
      </ol>
      <p>Under the rules you&apos;ll find every Bonus Star the game can hand out and what it rewards.</p>

      <h2>Character Randomizer</h2>
      <p>
        Pick how many people are playing (up to four) and press <strong>Randomize Characters</strong>. Everyone gets a
        different character, and empty seats fill with CPUs unless you switch that off in the options. <strong>Refresh
        Character</strong> re-rolls one seat; <strong>Reroll everyone</strong> does the lot. On team rulesets the teams are drawn
        for you too.
      </p>

      <h2>Minigame Randomizer</h2>
      <ul>
        <li><strong>One at a time:</strong> press <strong>Spin</strong> for a random minigame.</li>
        <li><strong>Set list for a minigame night:</strong> draw 5, 10 or 20 minigames, then tap who won each one for a running win count.</li>
      </ul>
      <p>
        The options let you pick categories and leave out motion-control minigames, keep to coin minigames, or (on Mario
        Party) skip the three that ask you to spin the control stick. Camera minigames only come up on the Switch 2 Edition
        if you turn them on.
      </p>

      <h2>Saving a setup</h2>
      <p>
        Signed in, <strong>Save this setup</strong> keeps the board, rules, players, characters and set list together. Find it
        later in <strong>Account</strong> &rsaquo; <strong>My Stuff</strong> &rsaquo; <strong>Setups &amp; Games</strong>.
      </p>

      <h2>Playing the whole night</h2>
      <p>
        The randomizers only roll. To keep score across games on everyone&apos;s phones, with an MVP at the end, start a
        <a href="/help/apps/live-game-nights"> live game night</a>.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
