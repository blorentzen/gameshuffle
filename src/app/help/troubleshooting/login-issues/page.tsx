import type { Metadata } from "next";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/troubleshooting/login-issues";
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
      <h1>Login Issues</h1>
      <p>Can&apos;t sign in? Here&apos;s how to troubleshoot.</p>

      <h2>Forgot password</h2>
      <ol>
        <li>Go to the <a href="/login">login page</a></li>
        <li>Click <strong>Forgot password?</strong></li>
        <li>Enter your email address</li>
        <li>Check your email for a reset link</li>
        <li>Follow the link to set a new password</li>
      </ol>
      <p>The reset link is valid for 1 hour. If it expires, request a new one.</p>

      <h2>Email verification not working</h2>
      <p>If you&apos;re stuck on the &ldquo;Please verify your email&rdquo; screen:</p>
      <ol>
        <li>Check spam or promotions folders for the verification email</li>
        <li>Click <strong>Resend verification email</strong> on the login page</li>
        <li>Make sure you&apos;re checking the email address you signed up with</li>
        <li>If still nothing, email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a></li>
      </ol>

      <h2>Can&apos;t sign in with Twitch or Discord</h2>
      <p>If you signed up using Twitch or Discord but can&apos;t log in:</p>
      <ol>
        <li>Make sure you&apos;re clicking <strong>Sign in with Twitch</strong> or <strong>Sign in with Discord</strong> (not the email/password form)</li>
        <li>Try in an incognito or private browser window — sometimes browser extensions interfere</li>
        <li>Clear your cookies for gameshuffle.co</li>
        <li>If the issue persists, email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a></li>
      </ol>

      <h2>&ldquo;Too many login attempts&rdquo;</h2>
      <p>If you&apos;ve tried logging in incorrectly too many times, your account is temporarily locked. Wait 60 seconds and try again.</p>
      <p>If you&apos;re locked out repeatedly, this might mean:</p>
      <ul>
        <li>Your password is forgotten — use the password reset flow</li>
        <li>Someone else is trying to access your account — change your password immediately</li>
      </ul>

      <h2>Account suspended</h2>
      <p>If you see a message saying your account is suspended, this is rare. Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> with your account email and we&apos;ll review.</p>

      <h2>Still can&apos;t sign in?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> with:</p>
      <ul>
        <li>The email address on your account</li>
        <li>What method you use to sign in (email/password, Twitch, Discord)</li>
        <li>Any error messages you&apos;re seeing</li>
      </ul>
      <p>We respond within 1–2 business days.</p>
    </HelpArticle>
  );
}
