import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HelpArticle } from "@/components/help/HelpArticle";
import { HelpToolLinks } from "@/components/help/HelpToolLinks";
import { findArticle } from "@/lib/help/manifest";
import { MARIO_KART_7_PUBLIC, mario7Shown } from "@/lib/games-visibility";

const HREF = "/help/apps/mario-kart-7-randomizer";
const meta = findArticle(HREF)!;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: `https://www.gameshuffle.co${HREF}` },
  openGraph: { siteName: "GameShuffle", title: `${meta.title} | GameShuffle Help`, description: meta.description, url: `https://www.gameshuffle.co${HREF}` },
  robots: MARIO_KART_7_PUBLIC ? { index: true, follow: true } : { index: false, follow: true },
};

/** Hidden in production with the randomizer until the Retro Mario Kart space opens (MARIO_KART_7_PUBLIC). */
export default function Page() {
  if (!mario7Shown()) notFound();
  return (
    <HelpArticle href={HREF}>
      <h1>How to use the Mario Kart 7 randomizer</h1>
      <HelpToolLinks links={[{ href: "/randomizers/mario-kart-7", label: "Mario Kart 7 randomizer" }]} />
      <p>
        Playing on Switch? Use the <Link href="/randomizers/mario-kart-8-deluxe">Mario Kart 8 Deluxe randomizer</Link>. The DS game
        has the <Link href="/randomizers/mario-kart-ds">Mario Kart DS randomizer</Link>.
      </p>
      <p>
        The <Link href="/randomizers/mario-kart-7">Mario Kart 7 randomizer</Link>{" "}gives every player a character and a kart built
        from a body, tires and a glider. It also rolls a cup, a race list and battles.
      </p>

      <h2>Roll everyone&apos;s kart</h2>
      <p>
        On the <strong>Kart Randomizer</strong>{" "}tab, press <strong>Add Player</strong>{" "}for each racer (up to eight, as in local
        wireless play), then <strong>Randomize Karts</strong>. Each card shows the character, the body, the tires and the glider.
        The refresh button on a card rolls only that player, and <strong>Save Build</strong>{" "}keeps a kart you like.
      </p>

      <h2>Parts unlocked</h2>
      <p>
        <strong>Every part</strong>{" "}rolls from all 17 bodies, 10 tires and 7 gliders, the gold parts included.
        <strong> Starting parts</strong>{" "}keeps to what a new save has: the Standard, Birthday Girl and Bolt Buggy bodies, the
        Standard, Roller and Monster tires and the Super Glider. The rest unlock at random as you collect coins.
      </p>

      <h2>Options</h2>
      <p>
        <strong>Change options</strong>{" "}keeps the characters to one or more weight classes (<strong>Feather</strong>,
        <strong> Light</strong>, <strong>Medium</strong>, <strong>Cruiser</strong>, <strong>Heavy</strong>), leaves out the nine you
        unlock, Mii included, and turns on <strong>Everyone a different character</strong>. Characters can repeat otherwise; parts
        always can. The <strong>Rolling animation</strong>{" "}switch turns the spinning reel on or off.
      </p>

      <h2>Roll the races</h2>
      <p>
        On the <strong>Race Randomizer</strong>{" "}tab, choose what to roll and press <strong>Randomize Races</strong>.
        <strong> A cup</strong>{" "}gives one of the eight cups in its order, and <strong>A new cup</strong>{" "}or
        <strong> A classic cup</strong>{" "}keeps to one kind. <strong>Races from every cup</strong>{" "}gives 4, 8, 12, 16 or 32
        courses, never the same one twice. Each roll comes with an engine class; open <strong>Change options</strong>{" "}to keep it to
        the classes you want. Wuhu Loop, Maka Wuhu and Rainbow Road show 3 sections, since they&apos;re one long lap.
      </p>

      <h2>Roll battles</h2>
      <p>
        On the <strong>Battle Randomizer</strong>{" "}tab, choose 1, 3 or 5 battles and press <strong>Randomize Battles</strong>. Each
        battle gets one of the six courses and a mode: Balloon Battle or Coin Runners. Options keep it to one mode.
      </p>

      <h2>Saving your setup</h2>
      <p>
        <strong>Save Complete Setup</strong>{" "}keeps the karts, the parts setting, your races and your battles together. You need to
        be signed in. Find them in <strong>Account</strong>{" "}&rsaquo; <strong>Your events</strong>{" "}&rsaquo;
        <strong> Saved setups</strong>; open one to load it back here.
      </p>

      <h2>On stream</h2>
      <p>
        If you stream with GS Pro and your Twitch category is Mario Kart 7, viewers can type <code>!gs-shuffle</code>{" "}to roll a
        character and a kart from every part. Add <code>start</code>{" "}for the starting parts, or a weight class like
        <code> feather</code>{" "}or <code>heavy</code>. Mods roll the races with <code>!gs setup</code>{" "}(a cup),
        <code> !gs setup new</code>{" "}or <code>!gs setup classic</code>, <code>!gs setup 8</code>{" "}for races, or
        <code> !gs setup battle</code>. See the <a href="/help/streaming/chat-commands">chat command reference</a>{" "}for the rest.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
