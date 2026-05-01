/**
 * POST /api/live/[streamer-slug]/action
 *
 * Body: { kind: 'pick-track' | 'ban-track' | 'pick-item' | 'ban-item', id: string }
 *
 * Endpoint backing the live view's tactile pick/ban actions. Per spec
 * §2.3, tactile actions execute the same backend handlers as chat — so
 * this route translates "viewer X clicked Pick Sky-High Sundae" into
 * the existing handlePickTrackCommand / handleBanTrackCommand /
 * handlePickItemCommand / handleBanItemCommand handlers.
 *
 * Authorization: viewer must be signed in via Supabase Auth (Twitch
 * provider). The handler trusts the viewer's identity for the action,
 * but the picks/bans state is per-session and scoped via existing
 * race_randomizer module config — no privileged write surface beyond
 * what chat commands already provide. We do NOT require the viewer
 * to be the broadcaster.
 *
 * Note: Phase A's chat handlers were broadcaster-only because chat
 * commands are server-driven. Phase B's tactile actions broaden
 * pick/ban to viewers per spec §5.4 ("when authenticated, viewers
 * can pick / ban"). Same backend behavior, broader caller set.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  handleBanItemCommand,
  handleBanTrackCommand,
  handlePickItemCommand,
  handlePickTrackCommand,
  type RaceCommandContext,
} from "@/lib/twitch/commands/race";

export const runtime = "nodejs";

interface RequestBody {
  kind?: "pick-track" | "ban-track" | "pick-item" | "ban-item";
  id?: string;
}

const VALID_KINDS = new Set(["pick-track", "ban-track", "pick-item", "ban-item"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ "streamer-slug": string }> }
) {
  const { "streamer-slug": slug } = await params;
  if (!slug) {
    return NextResponse.json({ error: "missing_slug" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  if (!viewer) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const { kind, id } = body;
  if (!kind || !VALID_KINDS.has(kind) || !id || typeof id !== "string") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Resolve the streamer (target session owner) from the slug. Service
  // role because the live page is anonymous-readable + we need to
  // bypass RLS for the lookup.
  const admin = createServiceClient();
  const fields = "id, twitch_id, twitch_username, display_name";
  const { data: byUsername } = await admin
    .from("users")
    .select(fields)
    .eq("username", slug)
    .maybeSingle();
  const streamer =
    byUsername ??
    (
      await admin
        .from("users")
        .select(fields)
        .eq("twitch_username", slug)
        .limit(1)
        .maybeSingle()
    ).data;
  if (!streamer) {
    return NextResponse.json({ error: "streamer_not_found" }, { status: 404 });
  }

  // Look up the streamer's Twitch connection — the chat handlers post
  // through the bot in the broadcaster's chat, so we need the
  // broadcaster's Twitch user id to construct a valid context.
  const { data: connection } = await admin
    .from("twitch_connections")
    .select("twitch_user_id")
    .eq("user_id", streamer.id)
    .maybeSingle();
  if (!connection?.twitch_user_id) {
    return NextResponse.json(
      { error: "streamer_not_twitch_connected" },
      { status: 400 }
    );
  }

  // Identify the viewer's Twitch identity so the chat command's
  // "actor" attribution reflects the actual viewer (not the streamer).
  // Falls back to the viewer's Supabase user id if no Twitch identity
  // is linked, but Phase B's auth flow only allows Twitch sign-in so
  // this should always resolve.
  const viewerTwitchIdentity = (viewer.identities ?? []).find(
    (i) => i.provider === "twitch"
  );
  const viewerTwitchId =
    (viewerTwitchIdentity?.identity_data?.provider_id as string | undefined) ??
    (viewerTwitchIdentity?.identity_data?.sub as string | undefined) ??
    viewerTwitchIdentity?.id ??
    viewer.id;
  const viewerDisplayName =
    (viewerTwitchIdentity?.identity_data?.preferred_username as string | undefined) ??
    (viewerTwitchIdentity?.identity_data?.name as string | undefined) ??
    viewer.email ??
    "viewer";

  const ctx: RaceCommandContext = {
    userId: streamer.id,
    broadcasterTwitchId: connection.twitch_user_id as string,
    senderTwitchId: viewerTwitchId,
    senderDisplayName: viewerDisplayName,
    botTwitchId: process.env.TWITCH_BOT_USER_ID || "",
  };

  try {
    if (kind === "pick-track") await handlePickTrackCommand(ctx, id);
    else if (kind === "ban-track") await handleBanTrackCommand(ctx, id);
    else if (kind === "pick-item") await handlePickItemCommand(ctx, id);
    else await handleBanItemCommand(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[live/action] handler failed:", err);
    return NextResponse.json({ error: "action_failed" }, { status: 500 });
  }
}
