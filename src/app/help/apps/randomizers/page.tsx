import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";
import { MELEE_PUBLIC, MKWII_PUBLIC, WONDER_PUBLIC } from "@/lib/games-visibility";
import { DOUBLE_DASH_PUBLIC, MARIO_KART_7_PUBLIC, MARIO_KART_DS_PUBLIC, SUPER_MARIO_KART_PUBLIC } from "@/lib/games-visibility";

const HREF = "/help/apps/randomizers";
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
      <h1>Using the Randomizers</h1>
      <p>
        The randomizers pick for you: characters, karts, boards, tracks, teams and whole matches. They&apos;re free and need
        no account to play. Every one is listed on <Link href="/randomizers">All randomizers</Link>.
      </p>

      <h2>The games</h2>
      <ul>
        <li>
          <strong>Mario Kart:</strong> the <Link href="/randomizers/mario-kart-8-deluxe">Mario Kart 8 Deluxe randomizer</Link>{" "}
          (character, vehicle, wheels and glider, up to 48 races) and the{" "}
          <Link href="/randomizers/mario-kart-world">Mario Kart World randomizer</Link>{" "}
          (character and vehicle, tracks and knockout rallies), plus items for both. The{" "}
          <Link href="/randomizers/mario-kart-64">Mario Kart 64</Link>{" "}randomizer gives up to four players a different
          character (the game&apos;s own rule) and rolls tracks and battle courses. See{" "}
          <a href="/help/apps/mario-kart-64-randomizer">the Mario Kart 64 randomizer</a>.
          {MKWII_PUBLIC && (
            <>
              {" "}The <Link href="/randomizers/mario-kart-wii">Mario Kart Wii</Link>{" "}randomizer rolls a character and a kart
              or bike in their size class for up to 12 players, plus tracks and battle arenas. See{" "}
              <a href="/help/apps/mario-kart-wii-randomizer">the Mario Kart Wii randomizer</a>.
            </>
          )}
          {DOUBLE_DASH_PUBLIC && (
            <>
              {" "}The <Link href="/randomizers/mario-kart-double-dash">Mario Kart Double Dash</Link>{" "}randomizer gives every
              kart a driver, an item thrower and a kart that fits them, pairs people two to a kart, and rolls cups and battles.
              See <a href="/help/apps/mario-kart-double-dash-randomizer">the Double Dash randomizer</a>.
            </>
          )}
          {MARIO_KART_DS_PUBLIC && (
            <>
              {" "}The <Link href="/randomizers/mario-kart-ds">Mario Kart DS</Link>{" "}randomizer rolls a character and a kart
              your save has opened for up to 8 players, plus cups, battles and Mission Mode challenges. See{" "}
              <a href="/help/apps/mario-kart-ds-randomizer">the Mario Kart DS randomizer</a>.
            </>
          )}
          {MARIO_KART_7_PUBLIC && (
            <>
              {" "}The <Link href="/randomizers/mario-kart-7">Mario Kart 7</Link>{" "}randomizer builds a kart from a body, tires
              and a glider for each player, from the parts your save has, plus cups and battles. See{" "}
              <a href="/help/apps/mario-kart-7-randomizer">the Mario Kart 7 randomizer</a>.
            </>
          )}
          {SUPER_MARIO_KART_PUBLIC && (
            <>
              {" "}The <Link href="/randomizers/super-mario-kart">Super Mario Kart</Link>{" "}randomizer gives each of two players
              a different racer and rolls cups, race lists and battle courses. See{" "}
              <a href="/help/apps/super-mario-kart-randomizer">the Super Mario Kart randomizer</a>.
            </>
          )}
        </li>
        <li>
          <strong>Mario Party:</strong> Jamboree, Superstars and the three Nintendo 64 games. Board, rules, turns, Bonus Stars,
          characters and minigames. See <a href="/help/apps/mario-party-randomizers">the Mario Party randomizers</a>.
        </li>
        <li>
          <strong>Pokémon:</strong>{" "}rental teams for Pokémon Stadium and Stadium 2, and the Fire Red &amp; Leaf Green run
          challenge. See <a href="/help/apps/pokemon-randomizers">the Pokémon randomizers</a>.
        </li>
        <li>
          <strong>GoldenEye 007:</strong> a whole multiplayer match plus a character for everyone. See{" "}
          <a href="/help/apps/goldeneye-randomizer">the GoldenEye randomizer</a>.
        </li>
        <li>
          <strong>Smash Ultimate:</strong>{" "}<Link href="/randomizers/super-smash-bros-ultimate">fighters for up to eight</Link>,
          the stage and rules, and Squad Strike squads, with the DLC you own. See{" "}
          <a href="/help/apps/smash-ultimate-randomizer">the Smash Ultimate randomizer</a>.
          {MELEE_PUBLIC && (
            <>
              {" "}The <Link href="/randomizers/super-smash-bros-melee">Melee</Link>{" "}randomizer gives up to four players a fighter
              and costume and rolls a legal stage. See <a href="/help/apps/melee-randomizer">the Melee randomizer</a>.
            </>
          )}
        </li>
        {WONDER_PUBLIC && (
          <li>
            <strong>Super Mario Bros. Wonder:</strong>{" "}<Link href="/randomizers/super-mario-bros-wonder">a character and a badge
            for up to four</Link>, a level and challenge rules. See{" "}
            <a href="/help/apps/super-mario-bros-wonder-randomizer">the Wonder randomizer</a>.
          </li>
        )}
        <li>
          <strong>Perfect Dark:</strong>{" "}<Link href="/randomizers/perfect-dark">a Combat Simulator match</Link>{" "}(scenario,
          arena, weapon set, time limit, simulants and an optional chaos rule) plus a character for everyone. Joanna counts
          once, in a random outfit. See <a href="/help/apps/perfect-dark-randomizer">the Perfect Dark randomizer</a>.
        </li>
        <li>
          <strong>Hero shooters:</strong>{" "}<Link href="/randomizers/overwatch">Overwatch</Link>{" "}and{" "}
          <Link href="/randomizers/marvel-rivals">Marvel Rivals</Link>{" "}hero roulettes: a different hero for up to six,
          Overwatch&apos;s role queue, no repeats across the night, Team-Up teams on Rivals, and a random map. New heroes
          join on their release day. See <a href="/help/apps/hero-shooter-randomizers">the hero shooter randomizers</a>.
        </li>
        <li>
          <strong>Splatoon 3:</strong>{" "}<Link href="/randomizers/splatoon-3">a weapon kit for up to eight</Link>{" "}(main, sub
          and special, from all 173), a battle or a set that never repeats a stage, a Salmon Run stage, and Alpha and Bravo teams.
          See <a href="/help/apps/splatoon-randomizer">the Splatoon 3 randomizer</a>.
        </li>
        <li>
          <strong>Kirby Air Riders:</strong>{" "}<Link href="/randomizers/kirby-air-riders">a rider and machine for up to eight</Link>,
          an Air Ride or Top Ride course, and the City Trial Stadium. Legendary machines are off by default, since not every
          mode allows them. See <a href="/help/apps/kirby-air-riders-randomizer">the Kirby Air Riders randomizer</a>.
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
        <strong> game-night setup</strong>, a Mario Party setup, or a set of Pokémon Stadium teams. They appear in
        <strong> Account</strong> &rsaquo; <strong>Your events</strong> &rsaquo; <strong>Saved setups</strong> and on your
        <a href="/help/community/public-profile"> public profile</a>. Pokémon and GoldenEye also have <strong>Copy</strong>{" "}
        buttons for pasting results into chat or Discord, and a Fire Red &amp; Leaf Green run has a link that rebuilds it exactly.
      </p>

      <h2>From Discord</h2>
      <p>
        The <a href="/help/community/discord-bot">Discord bot</a>&apos;s <code>/gs-randomize</code> rolls for any of these games
        in your server (start typing the game name), with user tagging and per-player re-rolls. <strong>Open in GameShuffle</strong>{" "}
        opens the randomizer; for Mario Kart it loads the same combos on the web.
      </p>

      <h2>On stream</h2>
      <p>
        Running a <a href="/help/getting-started/your-first-session">session</a>? Viewers roll their own pick for the game
        you&apos;re streaming with <code>!gs shuffle</code> (a kart combo, fighter, hero, weapon kit and more), and your rolls
        animate on your <a href="/help/streaming/obs-overlay">OBS overlay</a>. See the
        <a href="/help/streaming/chat-commands"> chat command reference</a> for the full set.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> with any randomizer questions.</p>
    </HelpArticle>
  );
}
