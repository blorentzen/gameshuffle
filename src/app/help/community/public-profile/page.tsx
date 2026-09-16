import type { Metadata } from "next";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/community/public-profile";
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
      <h1>Your Public Profile &amp; Personalization</h1>
      <p>
        Your public profile lives at <code>gameshuffle.co/u/your-handle</code>. It shows your games,
        your crews, and your activity, and you can personalize how it looks.
      </p>

      <h2>Turn your profile on</h2>
      <p>
        Go to <strong>Account</strong> &rsaquo; <strong>Profile</strong> and set a
        <strong> username</strong>, then flip <strong>Public Profile</strong> on. A username is
        required to be public (it&apos;s also your <code>/u</code>, <code>/c</code>, and
        <code> /live</code> handle).
      </p>

      <h2>Fill out who you are</h2>
      <p>On <strong>Account</strong> &rsaquo; <strong>Profile</strong> you can set:</p>
      <ul>
        <li><strong>Display name</strong> and <strong>avatar</strong>.</li>
        <li><strong>Bio, pronouns, region, timezone,</strong> and <strong>favorite games</strong> (with real cover art) in the &ldquo;About you&rdquo; card.</li>
        <li>A <strong>profile banner</strong>, uploaded and cropped right in the browser.</li>
        <li><strong>Gamertags</strong> (with a visibility setting) and <strong>socials</strong>, which render with service icons.</li>
        <li><strong>Board game</strong> preferences, and your <strong>Top Friends</strong>.</li>
      </ul>

      <h2>Personalize it</h2>
      <p>
        In the <strong>&ldquo;Personalize your profile&rdquo;</strong> card (Account &rsaquo; Profile)
        you can add:
      </p>
      <ul>
        <li>A <strong>tagline</strong> or status line under your name.</li>
        <li>A <strong>featured game</strong> and a <strong>featured card</strong>.</li>
        <li>A <strong>pinned post</strong> at the top of your feed.</li>
        <li>An <strong>accent color</strong> that tints your profile and other surfaces that are about you.</li>
      </ul>
      <p>These autosave as you edit. Your own profile shows an <strong>Edit profile</strong> button that jumps straight here.</p>

      <h2>Pick a theme</h2>
      <p>
        There are two kinds of theming, and they do different things:
      </p>
      <ul>
        <li>
          <strong>Light / dark mode</strong> (Account &rsaquo; Profile, the Theme toggle): controls
          how the GameShuffle app looks <em>for you</em>. Choose &ldquo;Match my system theme&rdquo;
          or force dark mode. It only affects the signed-in app, marketing pages stay light.
        </li>
        <li>
          <strong>Brand theme</strong> (Account &rsaquo; <strong>Brand &amp; Theme</strong>): a color
          preset that re-skins your <em>customer-facing</em> surfaces, your OBS overlay,
          <code> /live</code> page, public profile, and community page, in your colors. It does not
          change your account dashboard.
        </li>
      </ul>
      <p>Your accent color and brand theme apply together across the surfaces your audience sees.</p>

      <h2>What visitors see on your profile</h2>
      <ul>
        <li>Your banner, avatar, name (with any verified or GS Pro badge), tagline, and bio.</li>
        <li>A <strong>Watch live</strong> link and a <strong>Community</strong> badge if you stream.</li>
        <li><strong>Follow</strong> and <strong>Message</strong> buttons (messaging needs a mutual follow).</li>
        <li>Tabs: <strong>Overview</strong> (stats, featured game/card, your <strong>Represents</strong> crews, favorite games, top friends, communities, activity, saved setups), plus <strong>Tournaments</strong>, <strong>Cards</strong>, and <strong>About</strong> as they apply.</li>
      </ul>

      <h2>Privacy</h2>
      <p>
        You control visibility: keep your profile private by leaving Public Profile off, scope who
        sees your gamertags, and manage blocks from <strong>Account</strong> &rsaquo;
        <strong> Security</strong>. See also <a href="/help/account/email-preferences">Email
        Preferences</a> and <a href="/help/account/deleting-account">Deleting Your Account</a>.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> with any profile questions.</p>
    </HelpArticle>
  );
}
