/**
 * GET /api/twitch/lobby/[token]?session=<uuid>
 *
 * Public endpoint backing the /lobby/[token] viewer page. Resolves the
 * streamer's overlay_token to their connection, finds the active (or
 * test) session, and returns the full participant roster + each
 * viewer's current combo so the page can render a complete lobby view.
 *
 * Same auth model as the OBS overlay: the URL token IS the secret.
 * Anyone with the link can read.
 *
 * Hot-path optimization (overlay-polling-optimization-spec): the client
 * caches the active session id and passes it back in `?session=`. When
 * the param is present and validates against this token's owner, we
 * skip the `findTwitchSessionForUser` query and read the session row
 * directly. Stale or mismatched ids fall through to the full lookup;
 * the response always carries the current session info so the client
 * can update its cached id.
 */

import { NextResponse } from "next/server";
import { createTwitchAdminClient } from "@/lib/twitch/admin";
import { TWITCH_GAMES } from "@/lib/twitch/games";
import {
  findTwitchSessionForUser,
  listActiveTwitchParticipants,
  type TwitchSessionRow,
} from "@/lib/sessions/twitch-platform";

export const runtime = "nodejs";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ResolvedSession {
  id: string;
  randomizerSlug: string | null;
  status: "active" | "test";
  startedAt: string;
}

export async function GET(
  request: Request,
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

  const sessionParam = new URL(request.url).searchParams.get("session");

  // Hot path: client provided a session id. Validate ownership against
  // this token's connection. Single-row lookup by primary key + owner
  // check skips the `findTwitchSessionForUser` query that the Supabase
  // log shows hammering at ~30/min.
  let resolved: ResolvedSession | null = null;
  if (sessionParam && UUID_REGEX.test(sessionParam)) {
    const { data: ownedSession } = await admin
      .from("gs_sessions")
      .select("id, status, config, feature_flags, activated_at, created_at")
      .eq("id", sessionParam)
      .eq("owner_user_id", connection.user_id)
      .in("status", ["active", "ending"])
      .maybeSingle();
    if (ownedSession) {
      const row = ownedSession as {
        id: string;
        status: string;
        config?: { game?: string | null } | null;
        feature_flags?: { test_session?: boolean } | null;
        activated_at: string | null;
        created_at: string;
      };
      const isTest = !!row.feature_flags?.test_session;
      resolved = {
        id: row.id,
        randomizerSlug: row.config?.game ?? null,
        status: isTest ? "test" : "active",
        startedAt: row.activated_at ?? row.created_at,
      };
    }
  }

  // Fall through to the full lookup when no session id was provided or
  // ownership/status validation failed. Treats stale ids as a "tell me
  // what the current session is" prompt.
  if (!resolved) {
    const sessionRow: TwitchSessionRow | null = await findTwitchSessionForUser(
      connection.user_id,
      ["active", "test"]
    );
    if (sessionRow) {
      // findTwitchSessionForUser narrows status to active|ended|test.
      // The "ended" branch can't happen here because we asked for
      // active+test only.
      resolved = {
        id: sessionRow.id,
        randomizerSlug: sessionRow.randomizer_slug,
        status: sessionRow.status as "active" | "test",
        startedAt: sessionRow.started_at,
      };
    }
  }

  if (!resolved) {
    return NextResponse.json({
      ok: true,
      broadcaster,
      session: null,
      participants: [],
    });
  }

  const slug = resolved.randomizerSlug;
  const game = slug ? TWITCH_GAMES[slug] : null;

  const participantRows = await listActiveTwitchParticipants(resolved.id);

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
      id: resolved.id,
      randomizerSlug: slug,
      gameTitle: game?.title ?? null,
      lobbyCap: game?.lobbyCap ?? null,
      hasWheels: game?.hasWheels ?? false,
      hasGlider: game?.hasGlider ?? false,
      status: resolved.status,
      startedAt: resolved.startedAt,
    },
    participants,
  });
}
