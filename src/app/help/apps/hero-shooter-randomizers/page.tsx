import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/apps/hero-shooter-randomizers";
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
      <h1>The Overwatch and Marvel Rivals randomizers</h1>
      <p>
        Hero roulette for the <Link href="/randomizers/overwatch">Overwatch randomizer</Link> and the{" "}
        <Link href="/randomizers/marvel-rivals">Marvel Rivals randomizer</Link>. Both work the same way: a hero for each player
        and a random map, plus role queue on Overwatch and Team-Up teams on Marvel Rivals. They&apos;re new, so some parts may
        still change.
      </p>

      <h2>Roll your heroes</h2>
      <p>
        Press <strong>Add Player</strong> for each person (up to six), then <strong>Roll heroes</strong>. Everyone gets a
        different hero, shown as a tile in its role&apos;s color. <strong>Refresh Hero</strong> re-rolls one player and keeps the
        rest; <strong>Reroll everyone</strong> does the lot.
      </p>

      <h2>Options</h2>
      <p>Press <strong>Change options</strong> beside the intro:</p>
      <ul>
        <li><strong>Roles:</strong> roll only from the roles you pick (Tank, Damage, Support on Overwatch; Vanguard, Duelist, Strategist on Marvel Rivals). Deadpool counts as every role.</li>
        <li><strong>Role queue (1 Tank, 2 Damage, 2 Support):</strong> Overwatch only. Player 1 gets a Tank, Players 2 and 3 Damage, Players 4 and 5 Support, like the game&apos;s 5v5 queue. A sixth player starts again as a Tank. With both on, the queue wins: a seat whose role you left out of Roles still gets a hero of that role.</li>
        <li><strong>No repeats tonight:</strong> a hero anyone has played stays out until the pool runs out. Press <strong>Next game (no repeats)</strong> between matches; <strong>Reset the night</strong> starts over.</li>
      </ul>

      <h2>Team-Up teams (Marvel Rivals)</h2>
      <p>
        A Team-Up is a pair: one hero equips it and a named partner switches on its extra effect. <strong>Roll a Team-Up
        team</strong> picks one at random and builds a six-hero team around it: the pair first, marked <strong>Team-Up</strong>,
        then four random heroes. This roll uses the whole roster, so your role and no-repeat options don&apos;t apply.
      </p>

      <h2>Roll the map</h2>
      <p>
        Press <strong>Roll a map</strong>, or the refresh button on the map card for another. To keep to certain modes, use{" "}
        <strong>Change options</strong> beside it. Overwatch rolls from the Standard pool (Control, Escort, Flashpoint, Hybrid and
        Push); Marvel Rivals from the core Convergence, Convoy and Domination maps.
      </p>

      <h2>New heroes, and why there are no pictures</h2>
      <p>
        Above each randomizer you&apos;ll see the hero count and when the roster was last checked. New heroes join on their
        release day. Heroes show as role-colored tiles with names instead of portraits, which keeps a whole team easy to read on
        a phone. Portraits may come later.
      </p>

      <h2>Sharing it</h2>
      <p><strong>Copy heroes</strong> gives you everyone&apos;s hero, and the map if you rolled one, as text for chat or Discord.</p>

      <h2>On stream</h2>
      <p>
        GS Pro streamers: while your Twitch category is one of these games, viewers type <code>!gs-shuffle</code> in chat to roll
        a hero, in a lobby of 10 (Overwatch) or 12 (Marvel Rivals). They can add a role:
      </p>
      <ul>
        <li><strong>Overwatch:</strong> <code>!gs-shuffle tank</code>, <code>damage</code> or <code>support</code>.</li>
        <li><strong>Marvel Rivals:</strong> <code>!gs-shuffle vanguard</code>, <code>duelist</code> or <code>strategist</code>.</li>
      </ul>
      <p>
        Words like dps and heal work too. Your rolls show on your <a href="/help/streaming/obs-overlay">OBS overlay</a>. See the{" "}
        <a href="/help/streaming/chat-commands">chat commands</a>.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
