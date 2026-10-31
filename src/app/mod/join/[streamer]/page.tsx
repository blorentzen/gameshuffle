/**
 * /mod/join/<streamer>: where `!gs mod` sends a Twitch mod (2026-10-10).
 * Sign in with Twitch, then one button checks the channel's Twitch mod list
 * and adds them to the streamer's GameShuffle mod team (src/lib/mods/join.ts).
 * Already a mod: straight to the mod view.
 */

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { isActiveMod, joinStreamer } from "@/lib/mods/join";
import { JoinClient } from "./JoinClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Mod on GameShuffle", robots: { index: false, follow: false } };

export default async function ModJoinPage({ params }: { params: Promise<{ streamer: string }> }) {
  const { streamer: raw } = await params;
  const streamer = await joinStreamer(raw);
  if (!streamer) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && (user.id === streamer.id || (await isActiveMod(streamer.id, user.id)))) redirect(`/mod/${encodeURIComponent(streamer.slug)}`);

  return (
    <main className="mod-join">
      <Container>
        <div className="mod-join__card">
          <p className="mod-join__eyebrow">Mods</p>
          <h1 className="mod-join__title">Mod {streamer.name}&rsquo;s GameShuffle</h1>
          <p className="mod-join__lede">
            If you mod {streamer.name}&rsquo;s Twitch chat, you can help run their stream tools here too: see the lobby and kick people from it, follow what&rsquo;s happening, and look after their card decks.
          </p>
          <ol className="mod-join__steps">
            <li className={user ? "is-done" : ""}>Sign in with the Twitch account you mod with{user ? " (done)" : ""}.</li>
            <li>We check you&rsquo;re a mod in {streamer.name}&rsquo;s Twitch channel, and you&rsquo;re in.</li>
          </ol>
          <JoinClient slug={streamer.slug} streamerName={streamer.name} signedIn={!!user} />
          <p className="mod-join__note">New to GameShuffle? Signing in with Twitch makes your free account. We&rsquo;ll suggest adding a backup password after.</p>
        </div>
      </Container>
    </main>
  );
}
