/**
 * /overlay/[token]
 *
 * Public OBS browser-source overlay. Resolves the streamer's overlay
 * token to a connection, then defers to the client component to poll
 * /api/twitch/overlay/[token]/latest and animate broadcaster shuffles.
 *
 * Server-side check just confirms the token exists so OBS doesn't render
 * a long-lived broken page on a typo. All animation + state lives in the
 * client child.
 */

import { notFound } from "next/navigation";
import { createTwitchAdminClient } from "@/lib/twitch/admin";
import { OverlayClient } from "./OverlayClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OverlayPage({
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

  return <OverlayClient token={token} />;
}
