import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HelpArticle } from "@/components/help/HelpArticle";
import { HelpToolLinks } from "@/components/help/HelpToolLinks";
import { findArticle } from "@/lib/help/manifest";
import { SUPER_MARIO_KART_PUBLIC, superMarioKartShown } from "@/lib/games-visibility";

const HREF = "/help/apps/super-mario-kart-randomizer";
const meta = findArticle(HREF)!;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: `https://www.gameshuffle.co${HREF}` },
  openGraph: { siteName: "GameShuffle", title: `${meta.title} | GameShuffle Help`, description: meta.description, url: `https://www.gameshuffle.co${HREF}` },
  robots: SUPER_MARIO_KART_PUBLIC ? { index: true, follow: true } : { index: false, follow: true },
};

/** Hidden in production with the randomizer until the Retro Mario Kart space opens (SUPER_MARIO_KART_PUBLIC). */
export default function Page() {
  if (!superMarioKartShown()) notFound();
  return (
    <HelpArticle href={HREF}>
      <h1>How to use the Super Mario Kart randomizer</h1>
      <HelpToolLinks links={[{ href: "/randomizers/super-mario-kart", label: "Super Mario Kart randomizer" }]} />
      <p>
        Playing the N64 sequel? Use the <Link href="/randomizers/mario-kart-64">Mario Kart 64 randomizer</Link>.
      </p>
      <p>
        The <Link href="/randomizers/super-mario-kart">Super Mario Kart randomizer</Link>{" "}picks a racer for each of the two
        players, and rolls a cup, a race list or battle courses for the SNES original.
      </p>

      <h2>Roll the racers</h2>
      <p>
        On the <strong>Racer Randomizer</strong>{" "}tab, keep two players or remove one, then press <strong>Randomize Racers</strong>.
        The two players always get different characters. Each card shows the driver and their class from the manual: The Bros.
        (Mario and Luigi), The Dragon and The Lady (Princess and Yoshi), The Showdown (Bowser and Donkey Kong Jr.) or The Small Guys
        (Koopa Troopa and Toad). <strong>Change options</strong>{" "}keeps the roll to one or more classes. The refresh button on a card
        rolls only that player.
      </p>

      <h2>Roll the races</h2>
      <p>
        On the <strong>Race Randomizer</strong>{" "}tab, choose <strong>A cup</strong>{" "}for one cup&apos;s five courses in order, or
        <strong> Races from every cup</strong>{" "}for 5, 10, 15 or 20 courses, never the same one twice, then press
        <strong> Randomize Races</strong>. Each roll comes with 50cc, 100cc or 150cc; the engine class is for Mario Kart GP, since
        Match Race always runs at 100cc.
      </p>

      <h2>Roll battle courses</h2>
      <p>
        On the <strong>Battle Randomizer</strong>{" "}tab, choose 1, 2 or 4 battles and press <strong>Randomize Battles</strong>{" "}for
        Battle Course 1 to 4.
      </p>

      <h2>Saving your setup</h2>
      <p>
        <strong>Save Complete Setup</strong>{" "}keeps the racers, your races and your battle courses together. You need to be signed
        in. Find them in <strong>Account</strong>{" "}&rsaquo; <strong>Your events</strong>{" "}&rsaquo; <strong>Saved setups</strong>;
        open one to load it back here.
      </p>

      <h2>On stream</h2>
      <p>
        If you stream with GS Pro and your Twitch category is Super Mario Kart, you and one viewer can type
        <code> !gs-shuffle</code>{" "}to roll a racer each (two in the lobby, never the same character). Mods roll the races with
        <code> !gs setup</code>{" "}(a cup), <code>!gs setup 10</code>{" "}for races, or <code>!gs setup battle</code>. See the
        <a href="/help/streaming/chat-commands"> chat command reference</a>{" "}for the rest.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
