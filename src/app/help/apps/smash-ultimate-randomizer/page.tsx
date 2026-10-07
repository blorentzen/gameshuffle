import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/apps/smash-ultimate-randomizer";
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
      <h1>The Smash Ultimate randomizer</h1>
      <p>
        The <Link href="/randomizers/super-smash-bros-ultimate">Super Smash Bros. Ultimate randomizer</Link>{" "}sets up a Smash
        night for two to eight players: a fighter and costume for everyone, a stage and rules, Custom Smash settings and Squad
        Strike squads. It&apos;s new, so some parts may still change.
      </p>

      <h2>Tell it which DLC you have</h2>
      <p>
        Rolls start with the base game only. To add Piranha Plant or a Fighters Pass, press <strong>Choose what I have</strong>{" "}
        at the top, tap the packs you own (or single fighters and stages) and press <strong>Save</strong>. Signed in, it&apos;s
        saved to your account; signed out, it stays in your browser. The <strong>Use my collection</strong> switch lets you roll
        from everything for a night without losing your list.
      </p>

      <h2>Fighter Randomizer</h2>
      <p>
        Press <strong>Add Player</strong> until everyone has a card, then <strong>Randomize Fighters</strong>. Each player gets a
        fighter and a costume number from 1 to 8 (the slot to pick on the fighter select screen). <strong>Refresh
        Fighter</strong> re-rolls one player. In <strong>Change options</strong>:
      </p>
      <ul>
        <li><strong>Echo Fighters:</strong> on by default, so Lucina, Daisy, Ken and the other echoes come up as fighters of their own. Switch it off to leave them out.</li>
        <li><strong>Mii Fighters:</strong> off by default. Adds the three Mii Fighters (you need a Mii made first).</li>
        <li><strong>No repeats (Smashdown):</strong> a fighter played once stays out for the night. Press <strong>Next game (no repeats)</strong> between matches; <strong>Reset the night</strong> starts over.</li>
        <li><strong>Series:</strong> roll only from the series you choose, like a Fire Emblem night.</li>
      </ul>

      <h2>Stage &amp; Rules</h2>
      <p>Pick <strong>Party Rules</strong> or <strong>Competitive Rules</strong>, then press <strong>Roll the stage and rules</strong>.</p>
      <ul>
        <li><strong>Party Rules:</strong> from <strong>Every stage</strong> or the <strong>Competitive list</strong>, with a random form (Normal, Battlefield or Omega), hazards on or off, and rolled rules: stock, timed or stamina, an item setting and sometimes the Final Smash meter.</li>
        <li><strong>Competitive Rules:</strong> legal stages with hazards off, 3 stocks, 7 minutes, no items.</li>
      </ul>
      <p>
        Each stage is marked <strong>Starter</strong>, <strong>Counterpick</strong>, <strong>Sometimes legal</strong> or{" "}
        <strong>Casual</strong>. <strong>Include stages some events allow</strong> adds the sometimes-legal ones, like Yoshi&apos;s
        Island. It&apos;s the common competitive list, so check your event&apos;s own rules.
      </p>
      <p>
        <strong>Roll Custom Smash</strong> changes two or three conditions from Normal (like Mega size, a Metal body or fast speed)
        and lists only those. Set them under Special Smash in the game.
      </p>

      <h2>Squad Strike</h2>
      <p>
        Choose <strong>3 fighters</strong> or <strong>5 fighters</strong> and press <strong>Draw squads</strong>. Each player gets
        that many different fighters, in order, using the same Echo, Mii and series options and your DLC list.
      </p>

      <h2>Saving a setup</h2>
      <p>
        Signed in, <strong>Save Complete Setup</strong> keeps everyone&apos;s fighters, the stage and rules, Custom Smash and the
        squads. Find it in <strong>Account</strong> &rsaquo; <strong>My Stuff</strong> &rsaquo; <strong>Setups &amp;
        Games</strong>, where you can open it again or copy a share link.
      </p>

      <h2>On stream</h2>
      <p>
        GS Pro streamers: while your Twitch category is Smash Ultimate, viewers type <code>!gs-shuffle</code> in chat to roll a
        fighter and costume number, in a lobby of 8. Your rolls show on your <a href="/help/streaming/obs-overlay">OBS
        overlay</a>. See the <a href="/help/streaming/chat-commands">chat commands</a>.
      </p>
      <ul>
        <li>
          <strong>Viewer battles:</strong> you or a mod type <code>!gs battle</code> and everyone in the lobby gets a different
          fighter at once, plus one stage from the competitive list. The lineup goes to chat and onto your overlay.
        </li>
        <li>
          <strong>Chat picks the stage or your fighter:</strong> <code>!draft start stage</code> (or <code>stages</code> for a
          best of 3) and <code>!draft start smash</code> (or <code>squad</code> for three fighters) put each pick to a chat vote.
          See <a href="/help/streaming/chat-draft">Chat Draft</a>.
        </li>
        <li>
          <strong>Cards on stream:</strong> with Smash on in a <a href="/help/apps/live-game-nights">live night</a>, you or a mod
          deal its Chance cards and missions from chat (<code>!chance</code>, <code>!chance vote</code>, <code>!mission</code>) and
          each one shows on your overlay.
        </li>
      </ul>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
