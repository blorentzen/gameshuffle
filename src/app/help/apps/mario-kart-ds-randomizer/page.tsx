import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HelpArticle } from "@/components/help/HelpArticle";
import { HelpToolLinks } from "@/components/help/HelpToolLinks";
import { findArticle } from "@/lib/help/manifest";
import { MARIO_KART_DS_PUBLIC, marioKartDsShown } from "@/lib/games-visibility";

const HREF = "/help/apps/mario-kart-ds-randomizer";
const meta = findArticle(HREF)!;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: `https://www.gameshuffle.co${HREF}` },
  openGraph: { siteName: "GameShuffle", title: `${meta.title} | GameShuffle Help`, description: meta.description, url: `https://www.gameshuffle.co${HREF}` },
  robots: MARIO_KART_DS_PUBLIC ? { index: true, follow: true } : { index: false, follow: true },
};

/** Hidden in production with the randomizer until the Retro Mario Kart space opens (MARIO_KART_DS_PUBLIC). */
export default function Page() {
  if (!marioKartDsShown()) notFound();
  return (
    <HelpArticle href={HREF}>
      <h1>How to use the Mario Kart DS randomizer</h1>
      <HelpToolLinks links={[{ href: "/randomizers/mario-kart-ds", label: "Mario Kart DS randomizer" }]} />
      <p>
        Playing the GameCube game? Use the <Link href="/randomizers/mario-kart-double-dash">Mario Kart Double Dash randomizer</Link>.
        The N64 game has the <Link href="/randomizers/mario-kart-64">Mario Kart 64 randomizer</Link>.
      </p>
      <p>
        The <Link href="/randomizers/mario-kart-ds">Mario Kart DS randomizer</Link>{" "}gives every player a character and a kart
        that character can take on your save. It also rolls a cup, a race list, battles and Mission Mode missions.
      </p>

      <h2>Roll everyone&apos;s kart</h2>
      <p>
        On the <strong>Kart Randomizer</strong>{" "}tab, press <strong>Add Player</strong>{" "}for each racer (up to eight, as in local
        wireless play), then <strong>Randomize Karts</strong>. Each card shows the character, their kart, their weight class and
        what the kart is to them: their signature kart, their standard kart, or another character&apos;s kart. The refresh button
        on a card rolls only that player.
      </p>

      <h2>Karts unlocked</h2>
      <p>
        Mario Kart DS opens karts as you win gold trophies, so <strong>Karts unlocked</strong>{" "}keeps the roll to what you have:
      </p>
      <ul>
        <li><strong>Starting karts:</strong>{" "}each character&apos;s signature kart and standard kart, as on a new save.</li>
        <li><strong>Each character&apos;s own karts:</strong>{" "}their second signature kart too, from gold in every 100cc Nitro cup. This is where the randomizer starts.</li>
        <li><strong>Own karts and four borrowed:</strong>{" "}four other characters&apos; signature karts too, seven in all, from gold in every 150cc Nitro or Retro cup.</li>
        <li><strong>Every kart:</strong>{" "}anyone in any of the 36 karts, from gold in all eight Mirror cups.</li>
      </ul>

      <h2>Options</h2>
      <p>
        <strong>Change options</strong>{" "}keeps the characters to <strong>Light</strong>, <strong>Medium</strong>{" "}or
        <strong> Heavy</strong>, and turns Daisy, Dry Bones, Waluigi and R.O.B. on or off, since they unlock by winning cups. Two
        players can be the same character in Mario Kart DS, so the randomizer allows it; <strong>Everyone a different character</strong>{" "}
        keeps everyone apart. The <strong>Rolling animation</strong>{" "}switch turns the spinning reel on or off.
      </p>

      <h2>Roll the races</h2>
      <p>
        On the <strong>Race Randomizer</strong>{" "}tab, choose what to roll and press <strong>Randomize Races</strong>.
        <strong> A cup</strong>{" "}gives one of the eight cups in its order, and <strong>A Nitro cup</strong>{" "}or
        <strong> A Retro cup</strong>{" "}keeps to one kind. <strong>Races from every cup</strong>{" "}gives 4, 8, 12, 16 or 32
        courses, never the same one twice. Each roll comes with an engine class; open <strong>Change options</strong>{" "}to keep it to
        the classes you want. GCN Baby Park shows its five laps.
      </p>

      <h2>Roll battles</h2>
      <p>
        On the <strong>Battle Randomizer</strong>{" "}tab, choose 1, 3 or 5 battles and press <strong>Randomize Battles</strong>. Each
        battle gets one of the six courses and a mode: Balloon Battle or Shine Runners. Options keep it to one mode.
      </p>

      <h2>Mission Mode challenges</h2>
      <p>
        On the <strong>Mission Randomizer</strong>{" "}tab, pick a level or <strong>Any level</strong>, choose 1, 3 or 5 missions and
        press <strong>Randomize Missions</strong>. Each card shows the game&apos;s own mission text, where it&apos;s played, the
        character the game gives you and the time limit. Bosses are in the mix unless you turn them off in the options. Level 7
        opens in the game once every mission and boss in Levels 1 to 6 has at least a ★, so Any level leaves it out until you turn
        on <strong>Level 7</strong>; picking Level 7 from the list rolls it either way.
      </p>

      <h2>Saving your setup</h2>
      <p>
        <strong>Save Complete Setup</strong>{" "}keeps the racers, the karts setting, your races, battles and missions together. You
        need to be signed in. Find them in <strong>Account</strong>{" "}&rsaquo; <strong>Your events</strong>{" "}&rsaquo;
        <strong> Saved setups</strong>; open one to load it back here.
      </p>

      <h2>On stream</h2>
      <p>
        If you stream with GS Pro and your Twitch category is Mario Kart DS, viewers can type <code>!gs-shuffle</code>{" "}to roll a
        character and one of their own karts. Add <code>start</code>, <code>borrowed</code>{" "}or <code>all</code>{" "}for a
        different step of the save, or <code>light</code>, <code>medium</code>{" "}or <code>heavy</code>{" "}for a weight class. Mods
        roll the races with <code>!gs setup</code>{" "}(a cup), <code>!gs setup nitro</code>{" "}or <code>!gs setup retro</code>,
        <code> !gs setup 8</code>{" "}for races, <code>!gs setup battle</code>, or <code>!gs setup mission</code>{" "}for a Mission
        Mode challenge. See the <a href="/help/streaming/chat-commands">chat command reference</a>{" "}for the rest.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
