import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/streaming/wheels";
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
      <h1>Using the Wheel</h1>
      <p>
        GameShuffle has two wheels: a free spinner anyone can use in the browser, and a Pro overlay
        wheel your chat spins live on stream. They share the same look, so what you build in one
        feels at home in the other.
      </p>

      <h2>The free wheel spinner</h2>
      <p>
        Open the <Link href="/wheel-spinner">wheel spinner</Link> from the
        <Link href="/tools"> Tools</Link> hub. No account needed. Add your entries, pick a color
        theme and fill style (solid, gradient, stripes, or dots), and spin. It runs entirely in your
        browser, remembers your last wheel, and plays a satisfying tick as it lands. Great for
        giveaways, deciding what to play, or family game night.
      </p>

      <h2>The Pro overlay wheel</h2>
      <p>
        On stream, the wheel becomes a shared toy your chat drives. Build wheels in
        <strong> Account</strong> &rsaquo; <strong>Stream Setup</strong> &rsaquo;
        <strong> Wheels</strong>: name a wheel, add entries, and choose its theme and fill style. The
        look is snapshotted onto each spin, so the overlay always matches what you designed.
      </p>

      <h3>Spinning it</h3>
      <ul>
        <li>Spin from the <a href="/hub">Hub</a>, or</li>
        <li>Type <code>!spin</code> in chat (broadcaster and mods).</li>
      </ul>
      <p>
        The wheel animates on your OBS overlay, and the winner is announced in chat exactly once,
        right when the wheel finishes landing, so chat never spoils the result early. Because the
        announcement waits on the overlay animation, your overlay browser source needs to be loaded
        for the winner to post.
      </p>

      <h3>Letting chat build the wheel</h3>
      <p>You can let viewers contribute entries (set per wheel):</p>
      <ul>
        <li><code>!wheel add &lt;option&gt;</code> — add an option</li>
        <li><code>!wheel remove &lt;option&gt;</code> — remove an option</li>
        <li><code>!wheel list</code> — show the current options</li>
        <li><code>!wheel clear</code> — clear viewer entries (mods and host)</li>
      </ul>

      <h3>Placing it on your overlay</h3>
      <p>
        The wheel is a positionable piece under <strong>Apps</strong> in the
        <a href="/help/streaming/obs-overlay"> Overlay Layout</a> editor. By default it&apos;s
        centered; move or resize it per format, or hide it when you&apos;re not using it.
      </p>

      <h2>Tips</h2>
      <ul>
        <li><strong>Keep the overlay loaded</strong> so <code>!spin</code> can announce the winner in chat.</li>
        <li><strong>Match the theme to your brand</strong> so the wheel fits the rest of your overlay.</li>
        <li><strong>Use viewer contributions for prompts</strong> (games, challenges, dares) so the wheel becomes a chat activity, not only a picker.</li>
      </ul>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> and we&apos;ll help you set up your wheel.</p>
    </HelpArticle>
  );
}
