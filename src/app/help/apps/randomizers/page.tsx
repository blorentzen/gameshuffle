import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/apps/randomizers";
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
      <h1>Using the Randomizers</h1>
      <p>
        The randomizers pick for you: characters, karts, boards, tracks, teams and whole matches. They&apos;re free and need
        no account to play. Every one is listed on <Link href="/randomizers">All randomizers</Link>.
      </p>

      <h2>The games</h2>
      <ul>
        <li>
          <strong>Mario Kart:</strong> <Link href="/randomizers/mario-kart-8-deluxe">Mario Kart 8 Deluxe</Link> (character,
          vehicle, wheels and glider, up to 48 races) and <Link href="/randomizers/mario-kart-world">Mario Kart World</Link>{" "}
          (character and vehicle, tracks and knockout rallies), plus items for both. The{" "}
          <Link href="/randomizers/mario-kart-64">Mario Kart 64</Link>{" "}randomizer gives up to four players a different
          character (the game&apos;s own rule) and rolls tracks and battle courses.
        </li>
        <li>
          <strong>Mario Party:</strong> Jamboree, Superstars and the three Nintendo 64 games. Board, rules, turns, Bonus Stars,
          characters and minigames. See <a href="/help/apps/mario-party-randomizers">the Mario Party randomizers</a>.
        </li>
        <li>
          <strong>Pokémon:</strong> rental teams for Pokémon Stadium and Stadium 2, and the Fire Red &amp; Leaf Green run
          challenge. See <a href="/help/apps/pokemon-randomizers">the Pokémon randomizers</a>.
        </li>
        <li>
          <strong>GoldenEye 007:</strong> a whole multiplayer match plus a character for everyone. See{" "}
          <a href="/help/apps/goldeneye-randomizer">the GoldenEye randomizer</a>.
        </li>
        <li>
          <strong>Smash Ultimate:</strong>{" "}<Link href="/randomizers/super-smash-bros-ultimate">fighters for up to eight</Link>,
          the stage and rules, and Squad Strike squads, with the DLC you own.
        </li>
        <li>
          <strong>Perfect Dark:</strong>{" "}<Link href="/randomizers/perfect-dark">a Combat Simulator match</Link>{" "}(scenario,
          arena, weapon set, time limit, simulants and an optional chaos rule) plus a character for everyone. Joanna counts
          once, in a random outfit.
        </li>
        <li>
          <strong>Hero shooters:</strong>{" "}<Link href="/randomizers/overwatch">Overwatch</Link>{" "}and{" "}
          <Link href="/randomizers/marvel-rivals">Marvel Rivals</Link>{" "}hero roulettes: a different hero for up to six,
          Overwatch&apos;s role queue, no repeats across the night, Team-Up teams on Rivals, and a random map. New heroes
          join on their release day.
        </li>
      </ul>
      <p>Randomizers marked <strong>New</strong> just launched: they work, and some art or features are still on the way.</p>

      <h2>How every randomizer works</h2>
      <ol>
        <li>The card at the top of each tab says what it rolls. Set your players there, then press the roll button.</li>
        <li><strong>Options</strong> beside it shows what&apos;s switched on. Tap <strong>Change options</strong> to filter what can come up (weight class, boards you own, cups, rules).</li>
        <li>Don&apos;t like one part? Re-roll just that player, track or part. On Mario Party, tap a <strong>lock</strong> to keep a board or rule on your next roll.</li>
        <li>Results spin for a moment before they land. Turn off <strong>Rolling animation</strong> if you&apos;d rather see them straight away; locked parts never spin.</li>
      </ol>

      <h2>Describe your night</h2>
      <p>
        On GoldenEye and Pokémon Stadium you can type what you want in plain words, like &quot;three of us, chaos night, no
        Oddjob&quot; or &quot;give me a rain team&quot;, and press <strong>Set it up</strong>. It sets the options for you; the
        randomizer still does every roll. You need a free account to use it. See <a href="/help/apps/ai-tools">AI tools</a>.
      </p>

      <h2>Saving your setups</h2>
      <p>
        Sign in to save what you build: a <strong>kart build</strong>, an <strong>item set</strong>, a whole
        <strong> game-night setup</strong>, a Mario Party setup, or a set of Pokémon Stadium teams. Saved setups appear in
        <strong> Account</strong> &rsaquo; <strong>My Stuff</strong> &rsaquo; <strong>Setups &amp; Games</strong> and on your
        <a href="/help/community/public-profile"> public profile</a>. Pokémon and GoldenEye also have <strong>Copy</strong>{" "}
        buttons for pasting results into chat or Discord, and a Fire Red &amp; Leaf Green run has a link that rebuilds it exactly.
      </p>

      <h2>From Discord</h2>
      <p>
        The <a href="/help/community/discord-bot">Discord bot</a>&apos;s <code>/gs-randomize</code> rolls Mario Kart combos in
        your server, with user tagging and per-player re-rolls. Each result includes an <strong>Open in GameShuffle</strong>{" "}
        link that loads the same combos on the web.
      </p>

      <h2>On stream</h2>
      <p>
        Running a <a href="/help/getting-started/your-first-session">session</a>? Viewers shuffle their own Mario Kart combos
        with <code>!gs shuffle</code>, and combos animate on your <a href="/help/streaming/obs-overlay">OBS overlay</a>. See the
        <a href="/help/streaming/chat-commands"> chat command reference</a> for the full set.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> with any randomizer questions.</p>
    </HelpArticle>
  );
}
