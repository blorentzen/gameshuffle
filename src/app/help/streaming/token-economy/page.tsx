import type { Metadata } from "next";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/streaming/token-economy";
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
      <h1>The Token Economy</h1>
      <p>
        Arcade Tokens are a play-money currency for your chat. Viewers earn them by taking part, then
        spend them on prediction markets, receive them as awards and bounties, and climb your
        leaderboards. Tokens are a GameShuffle Pro feature.
      </p>

      <h2>What tokens are (and aren&apos;t)</h2>
      <ul>
        <li><strong>Closed-loop.</strong> Tokens are never bought with real money and never cashed out. They have no monetary value; they&apos;re a game layer for engagement.</li>
        <li><strong>Per community.</strong> Balances live within your community, and every change is recorded in a ledger, so a balance is always the sum of what a viewer has earned and spent.</li>
        <li><strong>Earned by taking part.</strong> Viewers pick up tokens for joining in; the exact amounts are tuned by GameShuffle&apos;s economy settings.</li>
      </ul>

      <h2>Turning it on</h2>
      <p>
        Enable the pieces you want in <strong>Account</strong> &rsaquo; <strong>Community &amp;
        Chat</strong> &rsaquo; <strong>Chat Modules</strong>:
      </p>
      <ul>
        <li><strong>Prediction markets</strong> — viewers bet tokens on outcomes.</li>
        <li><strong>Awards</strong> — hand out tokens at your discretion.</li>
        <li><strong>Bounties</strong> — put tokens on a specific outcome.</li>
        <li><strong>Leaderboards</strong> — rank your community by tokens.</li>
        <li><strong>Chaos / events</strong> — token-fueled chat events.</li>
      </ul>
      <p>
        Some features are gated for compliance by region before your toggle applies; where betting
        isn&apos;t allowed, viewers see markets in a spectator mode instead. These guardrails
        can&apos;t be turned off.
      </p>

      <h2>Prediction markets</h2>
      <p>Open a market, let chat bet, then lock and resolve it:</p>
      <ul>
        <li><code>!gs market open [1|3|5]</code> — open a market with 1, 3, or 5 outcomes (host).</li>
        <li><code>!bet &lt;option&gt; &lt;amount&gt;</code> — viewers place a bet.</li>
        <li><code>!gs market lock</code> — stop new bets (host).</li>
        <li><code>!gs resolve &lt;value&gt;</code> — settle the market and pay out winners (host).</li>
        <li><code>!gs market close</code> — cancel and refund (host).</li>
      </ul>

      <h2>Awards &amp; bounties</h2>
      <ul>
        <li><code>!gs award @user &lt;amount&gt;</code> — a discretionary token award (host).</li>
        <li><code>!gs bounty &lt;amount&gt; &lt;description&gt;</code> — open a bounty tied to an outcome (host).</li>
        <li><code>!gs bounty award @user</code> — pay it out, or <code>!gs bounty cancel</code> to release it.</li>
      </ul>

      <h2>What viewers can do</h2>
      <ul>
        <li><code>!tokens</code> — check a balance.</li>
        <li><code>!give @user &lt;amount&gt;</code> — send tokens to another viewer.</li>
        <li><code>!leaderboard</code> — see the top holders in your community.</li>
      </ul>
      <p>
        Viewers also see a live token balance and open markets on your <code>/live</code> page. A
        community balance follows a viewer across the channels where they play. See the full
        <a href="/help/streaming/chat-commands"> chat command reference</a> for everything.
      </p>

      <h2>Leaderboards</h2>
      <p>
        Leaderboards have three layers: viewer performance, streamer engagement, and a global view.
        Streamers are operators, not contestants, so they&apos;re excluded from the viewer
        leaderboard.
      </p>

      <h2>Keeping it fair</h2>
      <ul>
        <li>Balances can never go negative; a spend that can&apos;t be covered is declined.</li>
        <li>Tokens can&apos;t be purchased or redeemed for anything of real value.</li>
        <li>Use awards and bounties to reward participation, not to imply real prizes.</li>
      </ul>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> and we&apos;ll help you set up your economy.</p>
    </HelpArticle>
  );
}
