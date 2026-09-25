import type { Metadata } from "next";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";
import { IconCheck, IconX } from "@tabler/icons-react";

const HREF = "/help/pro/overview";
const meta = findArticle(HREF)!;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: `https://www.gameshuffle.co${HREF}` },
  openGraph: { title: `${meta.title} | GameShuffle Help`, description: meta.description, url: `https://www.gameshuffle.co${HREF}` },
  robots: { index: true, follow: true },
};

/**
 * Yes / no cells for the comparison table.
 *
 * These were ✅ and ❌. A screen reader announces those as "white heavy check
 * mark" and "cross mark" — the glyph, not the meaning — so a row read out as
 * "Tournaments, white heavy check mark, white heavy check mark". The label is
 * the point; the icon is decoration beside it.
 */
function Yes() {
  return (
    <span className="help-cmp help-cmp--yes">
      <IconCheck size={16} stroke={2.4} aria-hidden />
      <span className="sr-only">Included</span>
    </span>
  );
}

function No() {
  return (
    <span className="help-cmp help-cmp--no">
      <IconX size={16} stroke={2.4} aria-hidden />
      <span className="sr-only">Not included</span>
    </span>
  );
}

export default function Page() {
  return (
    <HelpArticle href={HREF}>
      <h1>What is GameShuffle Pro?</h1>
      <p>Everything GameShuffle does is free to play. GameShuffle Pro adds the streamer tools that let your chat play along with you: cross-platform sessions, the token economy, overlay tools, and live tournament control.</p>

      <h2>What Pro adds</h2>
      <p><strong>Cross-platform sessions.</strong> Run one game night across Twitch and Discord from the Hub, with the chat bot, chat commands, and a session lifecycle that fans out announcements automatically.</p>
      <p><strong>Arcade Token economy.</strong> A closed-loop currency your chat plays for, with prediction markets, awards, bounties, and three-layer leaderboards. Tokens are never bought with money and never cashed out.</p>
      <p><strong>Stream tools on your overlay.</strong> The free tools go live on your OBS overlay: spin the wheel, roll dice, flip a coin, run a poll, bingo, a tier list, a countdown timer, and a raffle on screen, driven by chat commands and channel-point rewards.</p>
      <p><strong>Live tournament control.</strong> Advance the current race and it updates your overlay, your <code>/live</code> page, and chat at once. Run a <a href="/help/tournaments/multi-crew-tournaments">multi-crew battle</a> with crew standings on your overlay too.</p>
      <p><strong>Picks, bans, and modules.</strong> Participant-driven drafts and engagement modules your viewers vote and play through in real time.</p>
      <p><strong>Brand theming.</strong> A brand theme that reskins your overlay, <code>/live</code> page, and public profile in your colors.</p>
      <p><strong>The essentials too.</strong> The &ldquo;Reroll the Streamer&rsquo;s Combo&rdquo; channel-point reward, the public lobby viewer, and Discord lounge results with <code>/gs-result</code>.</p>

      <h2>Free vs Pro</h2>
      <table>
        <thead>
          <tr><th>Feature</th><th>Free</th><th>Pro</th></tr>
        </thead>
        <tbody>
          <tr><td>Randomizers (MK8DX, Mario Kart World)</td><td><Yes /></td><td><Yes /></td></tr>
          <tr><td>Free stream &amp; party tools (wheel, dice, bingo, and more)</td><td><Yes /></td><td><Yes /></td></tr>
          <tr><td>Tournaments &amp; championships</td><td><Yes /></td><td><Yes /></td></tr>
          <tr><td>Competitive lounge scoring</td><td><Yes /></td><td><Yes /></td></tr>
          <tr><td>TCG Companion + collection</td><td><Yes /></td><td><Yes /></td></tr>
          <tr><td>Profiles &amp; social</td><td><Yes /></td><td><Yes /></td></tr>
          <tr><td>Discord <code>/gs-randomize</code></td><td><Yes /></td><td><Yes /></td></tr>
          <tr><td>Cross-platform sessions (Hub, Twitch + Discord)</td><td><No /></td><td><Yes /></td></tr>
          <tr><td>Chat bot + channel-point reward</td><td><No /></td><td><Yes /></td></tr>
          <tr><td>Stream tools on your OBS overlay</td><td><No /></td><td><Yes /></td></tr>
          <tr><td>Arcade Token economy (markets, awards, leaderboards)</td><td><No /></td><td><Yes /></td></tr>
          <tr><td>Live tournament control</td><td><No /></td><td><Yes /></td></tr>
          <tr><td>Picks, bans &amp; modules</td><td><No /></td><td><Yes /></td></tr>
          <tr><td>Brand theming (overlay, /live, profile)</td><td><No /></td><td><Yes /></td></tr>
          <tr><td>Discord <code>/gs-result</code></td><td><No /></td><td><Yes /></td></tr>
        </tbody>
      </table>
      <p>The free tier is great for solo, family, and in-person play. Pro is for streamers running a game night their chat plays along with.</p>

      <h2>Pricing</h2>
      <p>See <a href="/gs-pro">the GameShuffle Pro page</a> for the current monthly and annual rates. All prices are in US dollars, and charges appear on your statement as <strong>GAMESHUFFLE</strong>.</p>

      <h2>Free trial</h2>
      <p>New Pro subscribers get a 14-day free trial. We require a payment method to start, but you can cancel anytime during the trial without being charged.</p>
      <p><a href="/help/pro/free-trial">Learn more about the free trial</a></p>

      <h2>Still have questions?</h2>
      <p>Visit <a href="/gs-pro">the GameShuffle Pro page</a> for full details, or email <a href="mailto:billing@gameshuffle.co">billing@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
