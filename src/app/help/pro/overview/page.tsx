import type { Metadata } from "next";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/pro/overview";
const meta = findArticle(HREF)!;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: `https://gameshuffle.co${HREF}` },
  openGraph: { title: `${meta.title} | GameShuffle Help`, description: meta.description, url: `https://gameshuffle.co${HREF}` },
  robots: { index: true, follow: true },
};

export default function Page() {
  return (
    <HelpArticle href={HREF}>
      <h1>What is GameShuffle Pro?</h1>
      <p>GameShuffle Pro unlocks the full streamer integration: chat bot, channel points, OBS overlay, advanced session features, and priority access to new capabilities.</p>

      <h2>What&apos;s included with Pro</h2>
      <p><strong>Twitch streamer integration.</strong> Bot commands in your chat (<code>!gs-shuffle</code>, <code>!gs-join</code>), EventSub-driven session lifecycle, &ldquo;Reroll the Streamer&rsquo;s Combo&rdquo; channel point reward.</p>
      <p><strong>OBS overlay.</strong> A transparent browser source that animates your new combo on screen every time you reroll.</p>
      <p><strong>Public lobby viewer.</strong> A shareable page showing your live participant roster and combos.</p>
      <p><strong>Feature modules.</strong> Picks/bans modules with timer auto-confirm, plus configurable per-module settings.</p>
      <p><strong>Discord lounge results.</strong> Post structured competitive lounge results from chat with <code>/gs-result</code>.</p>
      <p><strong>Priority feature access.</strong> Get early access to new GameShuffle capabilities.</p>

      <h2>Free vs Pro</h2>
      <table>
        <thead>
          <tr><th>Feature</th><th>Free</th><th>Pro</th></tr>
        </thead>
        <tbody>
          <tr><td>Standalone randomizers (MK8DX, MKWorld)</td><td>✅</td><td>✅</td></tr>
          <tr><td>Twitch sign-in / Discord sign-in</td><td>✅</td><td>✅</td></tr>
          <tr><td>Discord <code>/gs-randomize</code></td><td>✅</td><td>✅</td></tr>
          <tr><td>Tournament hosting (Beta)</td><td>✅</td><td>✅</td></tr>
          <tr><td>Twitch streamer integration (bot, overlay)</td><td>❌</td><td>✅</td></tr>
          <tr><td>Channel point reward</td><td>❌</td><td>✅</td></tr>
          <tr><td>Public lobby viewer</td><td>❌</td><td>✅</td></tr>
          <tr><td>Pick/Ban modules</td><td>❌</td><td>✅</td></tr>
          <tr><td>Discord <code>/gs-result</code></td><td>❌</td><td>✅</td></tr>
        </tbody>
      </table>
      <p>The free tier is great for solo or in-person play. Pro is for streamers running coordinated game sessions.</p>

      <h2>Pricing</h2>
      <p>See <a href="/pricing">/pricing</a> for the current monthly and annual rates. All prices are in US dollars. Charges appear on your statement as <strong>GAMESHUFFLE</strong>.</p>

      <h2>Free trial</h2>
      <p>New Pro subscribers get a 14-day free trial. We require a payment method to start, but you can cancel anytime during the trial without being charged.</p>
      <p><a href="/help/pro/free-trial">Learn more about the free trial</a></p>

      <h2>Still have questions?</h2>
      <p>Visit <a href="/pricing">/pricing</a> for full details, or email <a href="mailto:billing@gameshuffle.co">billing@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
