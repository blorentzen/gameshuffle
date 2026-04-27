import type { Metadata } from "next";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/getting-started/creating-an-account";
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
      <h1>Creating an Account</h1>
      <p>Getting started with GameShuffle takes about a minute.</p>

      <h2>Sign up</h2>
      <ol>
        <li>Go to <a href="/signup">gameshuffle.co/signup</a></li>
        <li>Enter your email address and choose a password</li>
        <li>Confirm you&apos;re at least 13 years old</li>
        <li>Agree to our <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a></li>
        <li>Click <strong>Create Account</strong></li>
      </ol>

      <h2>Verify your email</h2>
      <p>After signing up, check your inbox for a verification email from GameShuffle. Click the link in the email to confirm your address.</p>
      <p>If you don&apos;t see the email within a few minutes:</p>
      <ul>
        <li>Check your spam folder</li>
        <li>Make sure you typed your email correctly</li>
        <li>Try requesting a new verification email from the login page</li>
      </ul>

      <h2>Sign in with Twitch or Discord</h2>
      <p>Don&apos;t want to create yet another password? You can also sign in using your Twitch or Discord account. We&apos;ll create a GameShuffle account for you automatically.</p>
      <p>We never see or store your Twitch or Discord password — those platforms handle authentication directly.</p>

      <h2>What happens next</h2>
      <p>Once you&apos;re signed in, you can:</p>
      <ul>
        <li><a href="/help/getting-started/connecting-twitch">Connect your Twitch account</a> for streaming features</li>
        <li><a href="/help/getting-started/connecting-discord">Connect your Discord account</a> for bot integration</li>
        <li><a href="/help/getting-started/your-first-session">Start your first session</a></li>
      </ul>

      <h2>Still need help?</h2>
      <p>Email us at <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> and we&apos;ll get you sorted.</p>
    </HelpArticle>
  );
}
