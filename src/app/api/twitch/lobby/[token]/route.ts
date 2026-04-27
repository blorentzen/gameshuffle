/**
 * GET /api/twitch/lobby/[token]
 *
 * Public endpoint backing the /lobby/[token] viewer page. Resolves the
 * streamer's overlay_token to their connection, finds the active (or
 * test) session, and returns the full participant roster + each
 * viewer's current combo so the page can render a complete lobby view.
 *
 * Same auth model as the OBS overlay: the URL token IS the secret.
 * Anyone with the link can read.
 */

import { NextResponse } from "next/server";
import { createTwitchAdminClient } from "@/lib/twitch/admin";
import { TWITCH_GAMES } from "@/lib/twitch/games";
import {
  findTwitchSessionForUser,
  listActiveTwitchParticipants,
} from "@/lib/sessions/twitch-bridge";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }

  const admin = createTwitchAdminClient();
  const { data: connection } = await admin
    .from("twitch_connections")
    .select("user_id, twitch_user_id, twitch_login, twitch_display_name, public_lobby_enabled")
    .eq("overlay_token", token)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ error: "unknown_token" }, { status: 404 });
  }

  // Streamer can disable the public viewer per the visibility-controls
  // migration. Treat it the same as an unknown token from the outside —
  // don't leak that the streamer simply has it turned off.
  if (connection.public_lobby_enabled === false) {
    return NextResponse.json({ error: "unknown_token" }, { status: 404 });
  }

  const broadcaster = {
    twitchUserId: connection.twitch_user_id,
    login: connection.twitch_login,
    displayName: connection.twitch_display_name,
  };

  const sessionRow = await findTwitchSessionForUser(
    connection.user_id,
    ["active", "test"]
  );

  if (!sessionRow) {
    return NextResponse.json({
      ok: true,
      broadcaster,
      session: null,
      participants: [],
    });
  }

  const slug = sessionRow.randomizer_slug;
  const game = slug ? TWITCH_GAMES[slug] : null;

  const participantRows = await listActiveTwitchParticipants(sessionRow.id);

  const participants = participantRows.map((p) => ({
    twitchUserId: p.twitch_user_id,
    login: p.twitch_login,
    displayName: p.twitch_display_name,
    joinedAt: p.joined_at,
    isBroadcaster: p.twitch_user_id === connection.twitch_user_id,
    combo: p.current_combo,
    comboAt: p.current_combo_at,
  }));

  return NextResponse.json({
    ok: true,
    broadcaster,
    session: {
      id: sessionRow.id,
      randomizerSlug: slug,
      gameTitle: game?.title ?? null,
      lobbyCap: game?.lobbyCap ?? null,
      hasWheels: game?.hasWheels ?? false,
      hasGlider: game?.hasGlider ?? false,
      status: sessionRow.status,
      startedAt: sessionRow.started_at,
    },
    participants,
  });
}
