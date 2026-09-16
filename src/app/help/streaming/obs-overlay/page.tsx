import type { Metadata } from "next";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/streaming/obs-overlay";
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
      <h1>Setting Up Your OBS Overlay</h1>
      <p>
        Your GameShuffle overlay is a single browser source you drop into OBS. It shows your
        randomizer combos, wheel, dice, polls, tournament race card, crew standings, and the rest of
        your tools live on stream. One URL renders correctly in both landscape and vertical.
      </p>

      <h2>Before you start</h2>
      <p>
        You need <a href="/help/getting-started/connecting-twitch">Twitch connected</a> to get an
        overlay link (it&apos;s tied to your Twitch integration). GameShuffle Pro is required for the
        overlay and stream tools.
      </p>

      <h2>Get your overlay link</h2>
      <ol>
        <li>Sign in and go to <strong>Account</strong> &rsaquo; <strong>Stream Setup</strong> &rsaquo; <strong>Overlay Layout</strong>.</li>
        <li>
          Find the browser-source links near the top. There&apos;s one for each aspect ratio:
          <strong> Landscape (16:9)</strong> and <strong>Portrait (9:16)</strong>. Copy the one that
          matches your stream.
        </li>
      </ol>
      <p>
        Keep this URL private, it&apos;s the key to your overlay. If it ever leaks, you can
        regenerate your overlay token from the <strong>Integrations</strong> tab (Twitch Hub).
      </p>

      <h2>Add it to OBS</h2>
      <ol>
        <li>In OBS, under <strong>Sources</strong>, click <strong>+</strong> and choose <strong>Browser</strong>.</li>
        <li>Name it &ldquo;GameShuffle Overlay&rdquo; and click OK.</li>
        <li>Paste your overlay link into the <strong>URL</strong> field.</li>
        <li>
          Set the size to match your canvas: <strong>1920 &times; 1080</strong> for landscape, or
          <strong> 1080 &times; 1920</strong> for vertical.
        </li>
        <li>Click OK. The overlay is transparent, so drag it above your game capture in the source list.</li>
      </ol>
      <p>
        Nothing shows until a tool fires, which is normal. Trigger something (spin the wheel, roll
        dice, or start a test session) to confirm it&apos;s working.
      </p>

      <h2>Arrange your tools (Overlay Layout)</h2>
      <p>
        The <strong>Overlay Layout</strong> editor shows your real overlay at full size with sample
        data. Switch between the <strong>Tools</strong> and <strong>Apps</strong> sets, click a piece
        in the preview (or its chip), then drag it where you want. In the inspector you can tune its
        <strong> size</strong> and toggle <strong>Show on this format</strong> to hide pieces you
        don&apos;t use.
      </p>
      <p>
        <strong>Tools:</strong> Dice, Coin, Oracle (8-ball), Raffle, Timer, Bingo, Tier List, Poll.
      </p>
      <p>
        <strong>Apps:</strong> Tournament Race, Crew Standings, MK8DX Combo, MK World Combo, Wheel,
        Chat, Viewer Count.
      </p>
      <p>
        Each aspect ratio saves separately, so a 16:9 Twitch layout and a 9:16 vertical / co-stream
        layout can be arranged independently. Untouched pieces use smart defaults, so you only move
        what you care about.
      </p>

      <h2>Driving the overlay</h2>
      <p>
        Most pieces are triggered from chat or the Hub. See the
        <a href="/help/streaming/chat-commands"> chat command reference</a> for commands like
        <code> !spin</code>, <code>!gs-dice</code>, <code>!gs-bingo</code>, and <code>!crews</code>.
        The wheel and channel-point &ldquo;Reroll the Streamer&rsquo;s Combo&rdquo; reward also feed
        the overlay.
      </p>

      <h2>Troubleshooting</h2>
      <ul>
        <li><strong>Overlay is blank:</strong> that&apos;s the resting state. Fire a tool to confirm it renders.</li>
        <li><strong>Nothing appears when you trigger a tool:</strong> check the browser source URL is your current token, and that the piece isn&apos;t hidden for this format in Overlay Layout.</li>
        <li><strong>Right layout, wrong size:</strong> make sure the browser source dimensions match the format in the URL (<code>?format=landscape</code> vs <code>?format=portrait</code>).</li>
        <li><strong>Link stopped working:</strong> regenerate the overlay token from Integrations, then update the URL in OBS.</li>
      </ul>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> and we&apos;ll get your overlay dialed in.</p>
    </HelpArticle>
  );
}
