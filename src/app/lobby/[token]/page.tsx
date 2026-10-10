/**
 * /lobby/[token]: retired 2026-10-10. The lobby lives on the streamer's live
 * page now (`/live/<slug>?tab=room`), so old `!gs-lobby` links forward there.
 * Those links carried the overlay token in public chat, which is why the
 * chat commands now link the live page instead. A token that no longer
 * matches (regenerated) is a 404, as before.
 */

import { notFound, redirect } from "next/navigation";
import { createTwitchAdminClient } from "@/lib/twitch/admin";
import { getLiveSlugForUser } from "@/lib/twitch/streamerSlug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = { robots: { index: false, follow: false } };

export default async function LobbyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createTwitchAdminClient();
  const { data: connection } = await admin
    .from("twitch_connections")
    .select("user_id")
    .eq("overlay_token", token)
    .maybeSingle();
  const slug = connection?.user_id ? await getLiveSlugForUser(connection.user_id as string) : null;
  if (!slug) notFound();
  redirect(`/live/${encodeURIComponent(slug)}?tab=room`);
}
