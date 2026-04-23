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

export const runtime = "nodejs";

interface ParticipantRow {
  twitch_user_id: string;
  twitch_login: string;
  twitch_display_name: string;
  joined_at: string;
  current_combo: Record<string, unknown> | null;
  current_combo_at: string | null;
}

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
    .select("user_id, twitch_user_id, twitch_login, twitch_display_name")
    .eq("overlay_token", token)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ error: "unknown_token" }, { status: 404 });
  }

  const broadcaster = {
    twitchUserId: connection.twitch_user_id,
    login: connection.twitch_login,
    displayName: connection.twitch_display_name,
  };

  const { data: sessionRow } = await admin
    .from("twitch_sessions")
    .select("id, randomizer_slug, twitch_category_id, status, started_at")
    .eq("user_id", connection.user_id)
    .in("status", ["active", "test"])
    .order("status", { ascending: true })
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sessionRow) {
    return NextResponse.json({
      ok: true,
      broadcaster,
      session: null,
      participants: [],
    });
  }

  const slug = (sessionRow.randomizer_slug as string | null) ?? null;
  const game = slug ? TWITCH_GAMES[slug] : null;

  const { data: participantRows } = await admin
    .from("twitch_session_participants")
    .select("twitch_user_id, twitch_login, twitch_display_name, joined_at, current_combo, current_combo_at")
    .eq("session_id", sessionRow.id)
    .is("left_at", null)
    .order("joined_at", { ascending: true });

  const participants = ((participantRows as ParticipantRow[] | null) ?? []).map((p) => ({
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
