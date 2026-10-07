import type { Metadata } from "next";
import Link from "next/link";
import { Button, Container } from "@empac/cascadeds";
import { IconCircleCheck } from "@tabler/icons-react";

/** Where signing up from the Discord Activity ends: back to Discord, where the Activity picks the account up by itself. */

export const metadata: Metadata = {
  title: "You're in",
  robots: { index: false, follow: false },
};

export default function DiscordJoinedPage() {
  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "3rem" }}>
      <Container>
        <div className="auth-page discord-joined">
          <IconCircleCheck size={48} stroke={1.75} className="discord-joined__icon" aria-hidden />
          <h1 className="auth-page__title">You&apos;re in</h1>
          <p className="discord-join__text">Your GameShuffle account signs in with Discord now. Head back to Discord: within a few seconds GameShuffle shows your name, your Daily streak moves to your profile, and the Weekly opens up.</p>
          <div className="discord-joined__actions">
            <Link href="/account?tab=profile"><Button variant="secondary" fullWidth>See my profile</Button></Link>
            <Link href="/daily"><Button variant="ghost" fullWidth>Play the Daily here instead</Button></Link>
          </div>
        </div>
      </Container>
    </main>
  );
}
