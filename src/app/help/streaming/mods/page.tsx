import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/streaming/mods";
const meta = findArticle(HREF)!;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: `https://www.gameshuffle.co${HREF}` },
  openGraph: { siteName: "GameShuffle", title: `${meta.title} | GameShuffle Help`, description: meta.description, url: `https://www.gameshuffle.co${HREF}` },
  robots: { index: true, follow: true },
};

export default function Page() {
  return (
    <HelpArticle href={HREF}>
      <h1>Mods</h1>
      <p>
        Your mods can help run your stream from their own GameShuffle account. Each one gets a mod page for your channel at{" "}
        <code>gameshuffle.co/mod/your-name</code>, and you choose how much they can do there.
      </p>

      <h2>Add your mods</h2>
      <ul>
        <li>Anyone who mods your Twitch channel can join on their own: they type <code>!gs mod</code> in your chat (or open the link), sign in with Twitch, and we check your Twitch mod list. They&apos;re in straight away.</li>
        <li>On <strong>Streaming &gt; Setup &gt; Mods</strong> you can copy the mod link, post it in chat for someone on your list, or send a one-time invite.</li>
        <li>Remove a mod with <strong>Revoke</strong>. Someone you removed by hand can&apos;t join again on their own. If <strong>Auto-revoke</strong> is on, mods who lose their Twitch mod badge are removed at the next sync.</li>
      </ul>

      <h2>Standard and Full access</h2>
      <p>Everyone who joins starts with Standard access. Change it per mod on the Mods screen.</p>
      <ul>
        <li><strong>Standard:</strong> manage the lobby (kick or time someone out), follow the stream&apos;s activity, and edit your decks of Chance cards, missions and house rules.</li>
        <li>
          <strong>Full:</strong>{" "}everything in Standard, plus your stream&apos;s controls while you&apos;re live: rolls for the game on
          stream, picks and bans, the overlay tools (wheel, dice, coin, 8-ball, raffle, timer, bingo board, tier list) and live games
          (polls, Stream Bingo, Chat Draft, Chat Brain and <Link href="/help/streaming/break-mode">break mode</Link>).
        </li>
      </ul>
      <p>
        Starting, ending and editing the stream, predictions and bounties, and your settings stay with you. What a Full mod does
        on the overlay is credited to them, like &ldquo;Sam (mod)&rdquo;.
      </p>

      <h2>Chat commands</h2>
      <p>
        Twitch mods can use the mod commands in your chat whether or not they&apos;ve joined on GameShuffle, for example{" "}
        <code>!gs-kick @name</code>, <code>!gs-clear</code>, <code>!gs setup</code> and <code>!gs brb</code>. See{" "}
        <Link href="/help/streaming/chat-commands">chat commands</Link> for the full list, or your own commands page.
      </p>

      <h2>See what your mods see</h2>
      <p>
        Press <strong>Preview mod view</strong> on <strong>Streaming &gt; Setup &gt; Mods</strong>. While you&apos;re live it shows
        the same controls a Full mod gets.
      </p>
    </HelpArticle>
  );
}
