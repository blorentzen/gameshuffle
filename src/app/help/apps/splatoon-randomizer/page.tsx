import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/apps/splatoon-randomizer";
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
      <h1>The Splatoon 3 randomizer</h1>
      <p>
        The <Link href="/randomizers/splatoon-3">Splatoon 3 randomizer</Link>{" "}sets up a Private Battle night for up to eight
        players: a weapon kit for everyone, the mode and stage, a Salmon Run stage and Alpha and Bravo teams. It&apos;s new, so
        some parts may still change.
      </p>
      <p>
        It has three tabs: <strong>Weapon Randomizer</strong>, <strong>Battles &amp; Salmon Run</strong> and <strong>Teams</strong>.
      </p>

      <h2>Hand out weapon kits</h2>
      <p>
        On <strong>Weapon Randomizer</strong>, press <strong>Add Player</strong> until everyone has a card (up to eight), type
        names if you like, then press <strong>Randomize Weapons</strong>. Each player gets a kit: a main weapon with its sub and
        special. The card shows all three plus the weapon class, and no two players get the same kit.
      </p>
      <p>
        <strong>Refresh Weapon</strong> re-rolls one player and never lands on a kit someone else has. <strong>Remove
        Player</strong> takes a card away. Switch off <strong>Rolling animation</strong> if you&apos;d rather see results straight away.
      </p>

      <h2>Options</h2>
      <p>Press <strong>Change options</strong> beside the Options line, pick what you want, then press <strong>Done</strong>:</p>
      <ul>
        <li>
          <strong>Classes:</strong> pick one or more of the eleven classes (Shooters, Rollers, Chargers, Sloshers, Splatlings,
          Dualies, Brellas, Blasters, Brushes, Stringers and Splatanas). Picking none means every class.
        </li>
        <li>
          <strong>Replicas:</strong> off by default. The 13 replicas (like the Hero Shot Replica and the Order replicas from Side
          Order) share another weapon&apos;s kit, so leaving them out stops the same kit coming up twice. That&apos;s 160 kits
          without them and all 173 with them.
        </li>
        <li><strong>No repeats tonight:</strong> nobody gets a kit that&apos;s already been played tonight (see below).</li>
      </ul>
      <p>The Options line sums up what&apos;s switched on, and the intro tells you how many kits are in the pool.</p>

      <h2>No repeats tonight</h2>
      <p>
        With <strong>No repeats tonight</strong> on, press <strong>Next battle (no repeats)</strong> after each battle. It marks
        everyone&apos;s current kit as played and deals new ones nobody has used tonight, and the intro counts how many have been
        played. If there aren&apos;t enough fresh kits left for everyone, the whole pool comes back. To start over, press <strong>Reset the night</strong>{" "}(switching the option off or on clears the list too).
      </p>

      <h2>Roll the battle</h2>
      <p>
        On <strong>Battles &amp; Salmon Run</strong>, choose <strong>One battle</strong>, <strong>A set of 3</strong> or <strong>A set of 5</strong>, then press <strong>Roll the battle</strong>{" "}(it becomes <strong>Roll again</strong>). Each battle is a mode and one of
        the 25 stages, with a line on how the mode works. A set never repeats a stage, though a mode can come up more than once.
      </p>
      <p>
        <strong>Change options</strong> on this tab picks the modes: <strong>Turf War</strong>, <strong>Anarchy modes</strong>{" "}(Splat Zones, Tower Control, Rainmaker and Clam Blitz) or both. Both are on to start with, and one always stays on.
      </p>

      <h2>Salmon Run</h2>
      <p>
        Press <strong>Roll a Salmon Run stage</strong> for one of the seven Salmon Run stages. That&apos;s all there is to roll,
        since the game hands out the weapons in Salmon Run.
      </p>

      <h2>Teams</h2>
      <p>
        On <strong>Teams</strong>, press <strong>Make teams</strong> to split the players from the Weapon Randomizer tab into
        Alpha and Bravo as evenly as possible (Alpha gets the extra player on an odd count). Each player&apos;s weapon shows
        beside their name if you&apos;ve rolled one. <strong>Shuffle the teams</strong> draws them again. You need at least two players, and a
        Private Battle takes up to four a side.
      </p>

      <h2>Saving and sharing a setup</h2>
      <p>
        <strong>Save Complete Setup</strong>, at the top beside the tabs, keeps everyone&apos;s name and weapon, the battles, the
        Salmon Run stage and the teams together. Name it and press <strong>Save setup</strong>. Signed out, it takes you to
        create a free account first.
      </p>
      <p>
        Find it later in <strong>Account</strong> &rsaquo; <strong>My Stuff</strong> &rsaquo; <strong>Setups &amp; Games</strong>. The <strong>Open in Randomizer</strong> button loads it back, and <strong>Copy share link</strong> gives you
        a link to send to the lobby.
      </p>

      <h2>On stream</h2>
      <p>
        Streaming on Twitch with GS Pro? While your Twitch category is Splatoon 3, viewers join your lobby (it holds 8)
        with <code>!gs-join</code> and type <code>!gs-shuffle</code> to roll their own weapon kit: main, sub and special, from
        the pool without replicas. Your own rolls show on your <a href="/help/streaming/obs-overlay">OBS overlay</a>. See
        the <a href="/help/streaming/chat-commands">chat command reference</a>{" "}for the rest.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
