import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HelpArticle } from "@/components/help/HelpArticle";
import { HelpToolLinks } from "@/components/help/HelpToolLinks";
import { findArticle } from "@/lib/help/manifest";
import { DOUBLE_DASH_PUBLIC, doubleDashShown } from "@/lib/games-visibility";

const HREF = "/help/apps/mario-kart-double-dash-randomizer";
const meta = findArticle(HREF)!;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: `https://www.gameshuffle.co${HREF}` },
  openGraph: { siteName: "GameShuffle", title: `${meta.title} | GameShuffle Help`, description: meta.description, url: `https://www.gameshuffle.co${HREF}` },
  robots: DOUBLE_DASH_PUBLIC ? { index: true, follow: true } : { index: false, follow: true },
};

/** Hidden in production with the randomizer until the Retro Mario Kart space opens (DOUBLE_DASH_PUBLIC). */
export default function Page() {
  if (!doubleDashShown()) notFound();
  return (
    <HelpArticle href={HREF}>
      <h1>How to use the Mario Kart Double Dash randomizer</h1>
      <HelpToolLinks links={[{ href: "/randomizers/mario-kart-double-dash", label: "Mario Kart Double Dash randomizer" }]} />
      <p>Playing the N64 game? Use the <Link href="/randomizers/mario-kart-64">Mario Kart 64 randomizer</Link>.</p>
      <p>
        The <Link href="/randomizers/mario-kart-double-dash">Double Dash randomizer</Link>{" "}gives every kart two characters, one
        driving and one throwing items, and a kart they&apos;re allowed to drive. It also pairs the people in the room into karts,
        and rolls a cup, the All Cup Tour, a race list or battles.
      </p>

      <h2>Roll everyone&apos;s kart</h2>
      <p>
        On the <strong>Kart Randomizer</strong>{" "}tab, press <strong>Add Player</strong>{" "}for each kart (up to eight), then
        <strong> Randomize Karts</strong>. Each card shows the kart, who drives, who throws, the kart&apos;s class and the pair&apos;s
        special items. Nobody gets the same character, as on the game&apos;s character select screen. The refresh button on a
        card rolls only that kart, and <strong>Randomize now</strong>{" "}at the top of the page rolls everyone and scrolls you to
        the result.
      </p>
      <p>
        The kart follows the game&apos;s rule: its class is the heavier of the two characters. Two light characters drive a light
        kart, a light or medium character with a medium one drives a medium kart, and anyone with a heavy character drives a
        heavy kart. The Parade Kart fits any pair.
      </p>
      <p>
        Item Boxes give either character&apos;s special item, so the card names both: Mario and Peach get Fireballs and the
        Heart. Petey Piranha and King Boo can get any special item but the green Fireballs and Birdo&apos;s Egg.
      </p>

      <h2>Two to a kart</h2>
      <p>
        Turn on <strong>Two to a kart</strong>{" "}to play the game&apos;s co-op, with two people sharing each kart. Add everyone in
        the room under <strong>Who&apos;s playing</strong>, then press <strong>Randomize Karts</strong>. The randomizer puts people
        in karts of two and says who drives and who throws. With an odd number of people, one person has a kart alone and plays
        both characters. <strong>Swap seats after each race</strong>{" "}adds a line to each card saying who drives next.
      </p>

      <h2>Options</h2>
      <p>
        <strong>Change options</strong>{" "}keeps the karts to <strong>Light</strong>, <strong>Medium</strong>{" "}or
        <strong> Heavy</strong>, rolls only the game&apos;s own pairs (Mario and Luigi, Peach and Daisy and the rest), and
        turns the unlockable characters and karts on or off. With <strong>Karts you unlock</strong>{" "}off, only the eight karts
        open on a new save come up. The <strong>Rolling animation</strong>{" "}switch turns the spinning reel on or off.
      </p>

      <h2>Roll the races</h2>
      <p>
        On the <strong>Race Randomizer</strong>{" "}tab, choose what to roll and press <strong>Randomize Races</strong>.
        <strong> A cup</strong>{" "}gives one of the four cups in its order. <strong>The All Cup Tour</strong>{" "}gives all 16
        courses with Luigi Circuit first and Rainbow Road last, as in the game. <strong>Races from every cup</strong>{" "}gives 4,
        8, 12 or 16 courses, never the same one twice. Each roll comes with an engine class; open <strong>Change options</strong>{" "}
        to keep it to the classes you want. Baby Park and Wario Colosseum show their lap counts.
      </p>

      <h2>Roll battles</h2>
      <p>
        On the <strong>Battle Randomizer</strong>{" "}tab, choose 1, 3 or 5 battles and press <strong>Randomize Battles</strong>.
        Each battle gets a course and a mode: Balloon Battle, Shine Thief or Bob-omb Blast. Options keep it to some modes or
        leave out the two courses you unlock, Luigi&apos;s Mansion and Tilt-a-Kart.
      </p>

      <h2>Saving your setup</h2>
      <p>
        <strong>Save Complete Setup</strong>{" "}keeps the karts, the people in them, your races and your battles together. You
        need to be signed in. Find them in <strong>Account</strong>{" "}&rsaquo; <strong>Your events</strong>{" "}&rsaquo;
        <strong> Saved setups</strong>; open one to load it back here.
      </p>

      <h2>On stream</h2>
      <p>
        If you stream with GS Pro and your Twitch category is Mario Kart: Double Dash!!, viewers can type
        <code> !gs-shuffle</code>{" "}to roll a pair and a kart. Add <code>light</code>, <code>medium</code>{" "}or <code>heavy</code>{" "}
        for that class of kart, or <code>teams</code>{" "}for the game&apos;s own pairs. Mods roll the races with
        <code> !gs setup</code>{" "}(a cup), <code>!gs setup tour</code>{" "}for the All Cup Tour, <code>!gs setup 8</code>{" "}for
        races, or <code>!gs setup battle</code>. See the <a href="/help/streaming/chat-commands">chat command reference</a>{" "}for
        the rest.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
