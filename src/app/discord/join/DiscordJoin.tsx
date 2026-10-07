"use client";

/**
 * Signing up from the Discord Activity. The Activity can't sign anyone in
 * inside Discord's frame, so its "Sign up free" opens this page in the
 * browser: one "Continue with Discord" button. Using the same Discord account
 * links everything (users.discord_id), so the Daily streak and Chat Brain
 * answers played in Discord come along, and the Activity notices within a few
 * seconds (/api/activity/refresh). Already signed in: connect Discord instead.
 * New Discord-only accounts set a password on the way (site rule), then land
 * on /discord/joined.
 */

import Link from "next/link";
import { useState } from "react";
import { Alert, Button, Container } from "@empac/cascadeds";
import { IconCheck } from "@tabler/icons-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { startOAuth } from "@/lib/auth/oauth";

const POINTS = [
  "Your Daily streak on your profile, on every device",
  "Play the Weekly and climb the leaderboard",
  "Free randomizers, game night tools and tournaments for your group",
  "Chat Brain answers count toward the Founding Brain badge",
];

/** The Discord mark on the button (white on the primary blue). */
function DiscordMark() {
  // eslint-disable-next-line @next/next/no-img-element -- small local SVG
  return <img src="/images/icons/discord.svg" alt="" width={18} height={18} />;
}

export function DiscordJoin() {
  const { user, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const linked = !!user?.identities?.some((i) => i.provider === "discord");

  const go = async (link: boolean) => {
    setBusy(true);
    setError(null);
    const problem = await startOAuth("discord", `${window.location.origin}/auth/callback?redirect=${encodeURIComponent("/discord/joined")}`, { link, surface: "discord-activity" });
    if (problem) { setError(problem); setBusy(false); }
  };

  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "3rem" }}>
      <Container>
        {/* One rail: the reasons, then the one button, at the same width. */}
        <div className="discord-join">
          <h1 className="discord-join__heading">Your GameShuffle account, in one tap</h1>
          <p className="discord-join__text">Use the Discord account you play with, and everything you&apos;ve played in Discord comes with you.</p>
          <ul className="discord-join__points">
            {POINTS.map((pt) => <li key={pt}><IconCheck size={18} stroke={2.2} aria-hidden /> {pt}</li>)}
          </ul>
          {error && <Alert variant="error">{error}</Alert>}
          {loading ? null : user && linked ? (
            <div className="discord-join__action">
              <h2 className="discord-join__title">You&apos;re already set</h2>
              <p className="discord-join__text">This account signs in with Discord. Head back to Discord: GameShuffle picks it up in a few seconds.</p>
              <Link href="/account?tab=profile"><Button variant="secondary" size="large" fullWidth>Go to my account</Button></Link>
            </div>
          ) : user ? (
            <div className="discord-join__action">
              <p className="discord-join__text">You&apos;re signed in to GameShuffle. Connect the Discord account you play with to bring your Discord games over.</p>
              <Button variant="primary" size="large" fullWidth disabled={busy} onClick={() => void go(true)}>
                <span className="discord-join__btn"><DiscordMark /> Connect Discord</span>
              </Button>
            </div>
          ) : (
            <div className="discord-join__action">
              <Button variant="primary" size="large" fullWidth disabled={busy} onClick={() => void go(false)}>
                <span className="discord-join__btn"><DiscordMark /> Continue with Discord</span>
              </Button>
              <p className="discord-join__consent">
                By continuing, you confirm you&apos;re at least 13 and agree to our{" "}
                <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> and{" "}
                <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>. New accounts choose a password on the next step.
              </p>
            </div>
          )}
          {!user && (
            <p className="discord-join__foot">Already have a GameShuffle account? <Link href={`/login?redirect=${encodeURIComponent("/discord/join")}`}>Sign in</Link>, then connect Discord.</p>
          )}
          <p className="discord-join__fine">Free, no card required, and you can delete your account at any time.</p>
        </div>
      </Container>
    </main>
  );
}
