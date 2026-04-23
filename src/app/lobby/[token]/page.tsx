/**
 * /lobby/[token]
 *
 * Public viewer-facing page for a streamer's current shuffle lobby.
 * Referenced from the bot's !gs-lobby overflow message so viewers can
 * see the full participant list when the chat reply's 10-name cap
 * elides them. Same overlay_token as the OBS overlay — the URL is the
 * secret; anyone with it can read.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createTwitchAdminClient } from "@/lib/twitch/admin";
import { LobbyClient } from "./LobbyClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const admin = createTwitchAdminClient();
  const { data: connection } = await admin
    .from("twitch_connections")
    .select("twitch_display_name, twitch_login")
    .eq("overlay_token", token)
    .maybeSingle();

  const name = connection?.twitch_display_name || connection?.twitch_login || "GameShuffle";
  return {
    title: `${name}'s Shuffle Lobby`,
    description: `Live randomizer lobby for ${name} on GameShuffle.`,
    robots: { index: false, follow: false },
  };
}

export default async function LobbyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createTwitchAdminClient();
  const { data: connection } = await admin
    .from("twitch_connections")
    .select("id")
    .eq("overlay_token", token)
    .maybeSingle();

  if (!connection) {
    notFound();
  }

  return <LobbyClient token={token} />;
}
