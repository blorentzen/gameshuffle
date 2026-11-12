import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HelpArticle } from "@/components/help/HelpArticle";
import { HelpToolLinks } from "@/components/help/HelpToolLinks";
import { findArticle } from "@/lib/help/manifest";
import { WONDER_PUBLIC } from "@/lib/games-visibility";

const HREF = "/help/apps/super-mario-bros-wonder-randomizer";
const meta = findArticle(HREF)!;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: `https://www.gameshuffle.co${HREF}` },
  openGraph: { siteName: "GameShuffle", title: `${meta.title} | GameShuffle Help`, description: meta.description, url: `https://www.gameshuffle.co${HREF}` },
  robots: { index: true, follow: true },
};

/** Hidden in production with the randomizer until the Wonder space opens (WONDER_PUBLIC). */
export default function Page() {
  if (!WONDER_PUBLIC && process.env.NODE_ENV === "production") notFound();
  return (
    <HelpArticle href={HREF}>
      <h1>How to use the Super Mario Bros. Wonder randomizer</h1>
      <HelpToolLinks links={[{ href: "/randomizers/super-mario-bros-wonder", label: "Super Mario Bros. Wonder randomizer" }]} />
      <p>
        The <Link href="/randomizers/super-mario-bros-wonder">Super Mario Bros. Wonder randomizer</Link>{" "}turns a co-op session
        into a challenge: each of up to four players gets a character and a badge, and the group gets a level to play and up to
        three rules to play it by.
      </p>

      <h2>Roll a challenge</h2>
      <p>
        On the <strong>Challenge</strong>{" "}tab, press <strong>Add Player</strong>{" "}for each person (up to four, like the game),
        pick a <strong>World</strong>{" "}or leave it on <strong>Any world</strong>, then press <strong>Randomize Challenge</strong>.
      </p>
      <ul>
        <li><strong>Players:</strong> each card shows a character and a badge, with the badge&apos;s group and what it does. Nobody gets the same character, and badges are different too unless you turn on repeats. The refresh button on a card rolls that player again.</li>
        <li><strong>Level:</strong> the level to play, with its world and star rating. It has its own refresh button.</li>
        <li><strong>Rules:</strong> each rule says how long it lasts: this level, the next three levels or all night. Each has its own refresh button, and you never get two rules of the same kind.</li>
      </ul>
      <p>
        Some rules change the badges: with <strong>No badges</strong>{" "}the cards say so, and with <strong>Same badge for
        everyone</strong>{" "}every card shows the shared badge.
      </p>

      <h2>Options</h2>
      <p><strong>Change options</strong>{" "}opens these:</p>
      <ul>
        <li><strong>Version:</strong> turn on <strong>Nintendo Switch 2 Edition</strong>{" "}to add Rosalina, the 18 badges it brings and the Koopaling showdowns.</li>
        <li><strong>Characters:</strong> leave out the Yoshis and Nabbit, who take no damage, for a harder night.</li>
        <li><strong>Badges:</strong> pick the badge groups (Action, Boost, Expert) and which <strong>Badges you have</strong>: <strong>Every badge</strong>, <strong>Before the ending</strong>{" "}or <strong>First world only</strong>{" "}for a new save. Sound Off? stays out unless you want it; it only changes voices.</li>
        <li><strong>Levels:</strong> by default levels are courses, palaces, battleships and Bowser. Turn on Badge Challenges, Break Time!, Search Parties, KO Arenas or Wiggler Races to add them, and narrow by <strong>Star rating</strong>.</li>
        <li><strong>Rules:</strong> 0 to 3 rules, and which <strong>Kinds of rules</strong>{" "}to draw from: lives, badges, power-ups, how you play, and playing together.</li>
      </ul>

      <h2>Roll a run of levels</h2>
      <p>
        On the <strong>Levels</strong>{" "}tab, pick a world and how many levels (1 to 8), then press <strong>Roll the levels</strong>.
        The levels in a run are all different.
      </p>

      <h2>Saving a challenge</h2>
      <p>
        Signed in, <strong>Save Challenge</strong>{" "}keeps the players, the level and the rules. Find it in <strong>Account</strong>{" "}
        &rsaquo; <strong>Your events</strong>{" "}&rsaquo; <strong>Saved setups</strong>, where you can open it again or copy a share
        link.
      </p>

      <h2>On stream</h2>
      <p>
        GS Pro streamers: while your Twitch category is Super Mario Bros. Wonder, viewers type <code>!gs-shuffle</code>{" "}to roll a
        character and a badge (add <code>action</code>, <code>boost</code>{" "}or <code>expert</code>{" "}to keep the badge to that
        group). Mods roll the level with <code>!gs setup</code>, a world&apos;s level with <code>!gs setup desert</code>{" "}or
        <code> !gs setup magma</code>, several with <code>!gs setup 3</code>, and a rule with <code>!gs setup rule</code>. See the{" "}
        <a href="/help/streaming/chat-commands">chat commands</a>.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
