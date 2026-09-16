import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/apps/tcg-companion";
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
      <h1>TCG Companion</h1>
      <p>
        The <Link href="/tcg-companion">TCG Companion</Link> is a digital accessory kit for tabletop
        card games: the counters and trackers you&apos;d otherwise keep by hand. Pokemon Mode ships
        first, and it&apos;s free to use.
      </p>

      <h2>Getting started</h2>
      <p>On the entry screen you can:</p>
      <ul>
        <li><strong>Sign in to GameShuffle</strong> to save your game and use My Cards, or</li>
        <li><strong>Continue as guest</strong> to jump straight in. Guest play works fully but won&apos;t save.</li>
      </ul>

      <h2>What&apos;s in the kit (Pokemon Mode)</h2>
      <ul>
        <li><strong>Damage counters</strong> for each Pokemon in play.</li>
        <li><strong>Condition tracking</strong> (poisoned, burned, and the rest).</li>
        <li><strong>Prize counts</strong> for both players.</li>
        <li><strong>Coin flips</strong> and <strong>dice</strong> for effects that need them.</li>
      </ul>
      <p>The board is tuned for touch, so it works well on a phone or tablet next to your cards.</p>

      <h2>Saving your game</h2>
      <p>
        Signed-in players can save and restore a game state, handy for pausing a long match. Guests
        don&apos;t get saves, so sign in if you want to pick up where you left off.
      </p>

      <h2>My Cards (your collection)</h2>
      <p>
        <strong>My Cards</strong> is a searchable card collection you can browse and build. It&apos;s
        free, but it needs a signed-in account (no guests). Find it at <strong>Account</strong> &rsaquo;
        <strong> My Stuff</strong> &rsaquo; <strong>My Cards</strong>, or from the My Cards link in the
        Companion&apos;s header and entry screen.
      </p>

      <h2>Feedback and cards</h2>
      <p>
        There&apos;s an always-on feedback button in the app, we read it. You&apos;ll also find a
        <strong> Shop our Pokemon cards</strong> link that opens our TCGplayer storefront in a new tab.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> with any Companion questions.</p>
    </HelpArticle>
  );
}
