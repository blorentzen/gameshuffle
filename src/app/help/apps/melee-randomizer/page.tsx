import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HelpArticle } from "@/components/help/HelpArticle";
import { HelpToolLinks } from "@/components/help/HelpToolLinks";
import { findArticle } from "@/lib/help/manifest";
import { MELEE_PUBLIC } from "@/lib/games-visibility";

const HREF = "/help/apps/melee-randomizer";
const meta = findArticle(HREF)!;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: `https://www.gameshuffle.co${HREF}` },
  openGraph: { siteName: "GameShuffle", title: `${meta.title} | GameShuffle Help`, description: meta.description, url: `https://www.gameshuffle.co${HREF}` },
  robots: { index: true, follow: true },
};

/** Hidden in production with the randomizer until the Melee space opens (MELEE_PUBLIC). */
export default function Page() {
  if (!MELEE_PUBLIC && process.env.NODE_ENV === "production") notFound();
  return (
    <HelpArticle href={HREF}>
      <h1>How to use the Melee randomizer</h1>
      <HelpToolLinks links={[{ href: "/randomizers/super-smash-bros-melee", label: "Super Smash Bros. Melee randomizer" }]} />
      <p>
        The <Link href="/randomizers/super-smash-bros-melee">Super Smash Bros. Melee randomizer</Link>{" "}gives two to four players
        a fighter and a costume, and rolls a stage with party or tournament rules. Melee tournaments on GameShuffle strike stages
        the way locals do. Playing Ultimate? See <a href="/help/apps/smash-ultimate-randomizer">the Smash Ultimate
        randomizer</a>.
      </p>

      <h2>Fighter Randomizer</h2>
      <p>
        Press <strong>Add Player</strong>{" "}until everyone has a card, then <strong>Randomize Fighters</strong>. Each card shows a
        fighter and a costume, like <strong>Costume 3 · Blue</strong>: the number is its place on the character select screen, the
        color is what you&apos;ll see. Two players can land on the same fighter, as in the game. The refresh button on a card
        rolls that player again.
      </p>
      <p>
        All 26 fighters are in the pool. Sheik is her own pick: in the game you choose Zelda and transform, or hold A on Zelda
        to start as Sheik. Her card has no portrait because the game has none for her.
      </p>
      <p>In <strong>Change options</strong>:</p>
      <ul>
        <li><strong>No repeats (Smashdown):</strong> a fighter played once stays out for the night. Press <strong>Next game (no repeats)</strong>{" "}between matches; <strong>Reset the night</strong>{" "}starts over.</li>
        <li><strong>Series:</strong> roll only from the series you choose, like a Fire Emblem or Pokémon night.</li>
      </ul>

      <h2>Stage &amp; Rules</h2>
      <p>Pick <strong>Party Rules</strong>{" "}or <strong>Competitive Rules</strong>, then press <strong>Roll the stage and rules</strong>.</p>
      <ul>
        <li><strong>Party Rules:</strong> from <strong>Every stage</strong>{" "}(all 29) or the <strong>Competitive list</strong>, with rolled stock or timed rules and an item setting.</li>
        <li><strong>Competitive Rules:</strong> a legal stage, 4 stocks, 8 minutes, items off.</li>
      </ul>
      <p>
        The legal list follows current singles events: Battlefield, Dream Land, Final Destination, Fountain of Dreams and
        Yoshi&apos;s Story are the starters game 1 is struck from, and Pokémon Stadium is the counterpick. Check your own
        event&apos;s rules.
      </p>

      <h2>Run a Melee tournament</h2>
      <p>
        Pick Super Smash Bros. Melee when you <Link href="/tournament/create?game=super-smash-bros-melee">create a
        tournament</Link>. Bracket matches are played as sets, and the rules panel on the tournament&apos;s manage page sets how:
      </p>
      <ul>
        <li><strong>Sets</strong>{" "}and <strong>Finals:</strong> best of 3 or best of 5.</li>
        <li><strong>Stages:</strong> <strong>Strike, then counterpick</strong>{" "}(game 1 is struck from the starters in a 1-2-1 order, then the loser of each game picks) or <strong>Random legal stage</strong>.</li>
        <li><strong>Legal stages:</strong> tap a stage to add it to your event&apos;s list or take it off.</li>
        <li><strong>Starters, struck for game 1:</strong> singles (the five above), Pokémon Stadium in with Final Destination as a counterpick, doubles (Final Destination and Pokémon Stadium, no Fountain of Dreams), or your own starters.</li>
      </ul>
      <p>
        You run each set from the manage page (the strikes, the counterpick and the stage for each game), and players follow
        it on the tournament page. See{" "}
        <a href="/help/tournaments/tournament-formats">tournament formats</a>{" "}for brackets and Swiss.
      </p>

      <h2>Saving a setup</h2>
      <p>
        Signed in, <strong>Save Complete Setup</strong>{" "}keeps everyone&apos;s fighters and the stage and rules. Find it in
        <strong> Account</strong>{" "}&rsaquo; <strong>Your events</strong>{" "}&rsaquo; <strong>Saved setups</strong>, where you can open it
        again or copy a share link.
      </p>

      <h2>On stream</h2>
      <p>
        GS Pro streamers: while your Twitch category is Super Smash Bros. Melee, viewers type <code>!gs-shuffle</code>{" "}in chat to
        roll a fighter and costume, in a lobby of 4. Mods roll the match with <code>!gs setup</code>{" "}(a legal stage and the
        competitive rules), <code>!gs setup starters</code>{" "}(the five starters and the counterpick) or <code>!gs setup party</code>{" "}
        (any stage with party rules). See the <a href="/help/streaming/chat-commands">chat commands</a>.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
