import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/apps/perfect-dark-randomizer";
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
      <h1>The Perfect Dark randomizer</h1>
      <p>
        The <Link href="/randomizers/perfect-dark">Perfect Dark randomizer</Link>{" "}sets up a Combat Simulator match for one to
        four players: the scenario, the arena, a weapon set, a time limit and simulants, plus a different character for
        everyone. It&apos;s new, so some parts may still change.
      </p>

      <h2>Roll the match</h2>
      <p>
        Press <strong>Roll the match</strong>. You get one of six scenarios (like Combat, Hold the Briefcase or Capture the Case)
        with a line on how it scores, one of 16 arenas, a weapon set with its weapons listed, a time limit from 5 minutes to no
        limit, and your simulants with their difficulty. Temple, Complex and Felicity are marked as GoldenEye classics.
      </p>
      <p>
        Each part has its own refresh button, so you can change just the arena or just the weapons.
        <strong> Roll the match again</strong> rolls all of it. King of the Hill and Capture the Case split everyone, players and
        simulants, into Team 1 and Team 2; a new scenario or new simulants deals the teams again.
      </p>

      <h2>Pick everyone&apos;s character</h2>
      <p>
        Characters roll separately, so re-rolling the match never changes them. Press <strong>Randomize Characters</strong>{" "}
        (then <strong>Reroll everyone</strong>), or <strong>Refresh Character</strong> on one player. In
        <strong> Characters</strong>, choose <strong>Main characters</strong> (Joanna, Carrington, Cassandra, Elvis, Trent and the
        rest of the named cast) or <strong>Additional characters</strong> (guards, agents, lab techs and flight crew).
      </p>
      <p>
        Everyone gets a different person. Joanna counts once, in a random outfit (Combat, Arctic, Wet Suit, Party Frock and the
        rest), and Elvis&apos;s and Carrington&apos;s second outfits work the same way.
      </p>
      <p>
        You start with two players. <strong>Add Player</strong> goes up to four, <strong>Remove Player</strong> takes one away,
        and you can type a name on each card. Changing the number of players clears the match (teams and simulants depend on
        it), so roll it again; characters stay put. The <strong>Rolling animation</strong> switch turns the spinning reel on or
        off.
      </p>

      <h2>Options</h2>
      <p>Press <strong>Change options</strong>:</p>
      <ul>
        <li><strong>Simulants:</strong> none, or 1 to 8 bots (2 to start).</li>
        <li><strong>Simulant difficulty:</strong> pick which of Meat, Easy, Normal, Hard, Perfect and Dark they can roll. Leave them all off for any.</li>
        <li><strong>New save only:</strong> just what a fresh file has: Skedar, Pipes and Area 52, Combat and King of the Hill, up to 4 simulants on Meat, Easy or Normal, and the characters open from the start.</li>
        <li><strong>Team scenarios:</strong> on by default. Turn it off to leave out King of the Hill and Capture the Case.</li>
        <li><strong>Special simulants:</strong> some simulants also get a type, like KazeSim (charges in) or PeaceSim (never shoots).</li>
        <li><strong>A chaos option:</strong> adds one match rule such as One-Hit Kills, Slow Motion or Paintball. Roll the match again to change it.</li>
      </ul>

      <h2>Sharing it</h2>
      <p>
        <strong>Copy match</strong> gives you the whole match, the simulants and everyone&apos;s character (with teams) as text for
        chat or Discord.
      </p>

      <h2>On stream</h2>
      <p>
        If you stream with GS Pro and your Twitch category is Perfect Dark, viewers can type <code>!gs-shuffle</code> in chat to
        roll a multiplayer character of their own. The lobby holds four, like the game&apos;s online room. Your own rolls show on
        your <a href="/help/streaming/obs-overlay">OBS overlay</a>. See the <a href="/help/streaming/chat-commands">chat command
        reference</a> for the rest.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
