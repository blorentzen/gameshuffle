/**
 * GET /api/twitch/overlay/[token]/latest?since=<iso>&session=<uuid>
 *
 * Public endpoint hit by the OBS browser-source overlay. Resolves an
 * overlay_token to its connection, finds the streamer's current active
 * (or test) session, and returns the most recent broadcaster shuffle
 * event newer than `since`. Viewer shuffles never come through here —
 * the overlay only animates broadcaster combos per spec §8.
 *
 * No auth: the overlay token IS the authorization. Anyone with the URL
 * (i.e. the streamer who pasted it into OBS) can read.
 *
 * Hot-path optimization (overlay-polling-optimization-spec): the client
 * caches the active session id and passes it back in `?session=`. When
 * the param is present and validates against this token's owner, we
 * skip the `findTwitchSessionForUser` query and go straight to the
 * shuffle lookup. Stale or mismatched session IDs fall through to the
 * full lookup path, and the response always returns the *current*
 * session info so the client can update its cached id.
 */

import { NextResponse } from "next/server";
import { createTwitchAdminClient } from "@/lib/twitch/admin";
import {
  findTwitchSessionForUser,
  getLatestTwitchShuffleEvent,
  type TwitchSessionRow,
} from "@/lib/sessions/twitch-platform";

export const runtime = "nodejs";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ResolvedSession {
  id: string;
  randomizerSlug: string | null;
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
    .select("user_id, twitch_display_name")
    .eq("overlay_token", token)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ error: "unknown_token" }, { status: 404 });
  }

  const url = new URL(request.url);
  const since = url.searchParams.get("since");
  const sessionParam = url.searchParams.get("session");

  // Hot path: client provided a session id. Validate ownership against
  // this token's connection. The cheapest possible query — single row
  // by primary key + owner check.
  let resolved: ResolvedSession | null = null;
  if (sessionParam && UUID_REGEX.test(sessionParam)) {
    const { data: ownedSession } = await admin
      .from("gs_sessions")
      .select("id, config")
      .eq("id", sessionParam)
      .eq("owner_user_id", connection.user_id)
      .in("status", ["active", "ending"])
      .maybeSingle();
    if (ownedSession) {
      const config = (ownedSession as { config?: { game?: string | null } | null })
        .config;
      resolved = {
        id: (ownedSession as { id: string }).id,
        randomizerSlug: config?.game ?? null,
      };
    }
  }

  // Fall through to the full lookup if no session id was passed, or it
  // failed ownership/status validation. Treats any stale-id case as a
  // "tell me what the current session is" prompt.
  if (!resolved) {
    const session: TwitchSessionRow | null = await findTwitchSessionForUser(
      connection.user_id,
      ["active", "test"]
    );
    if (session) {
      resolved = {
        id: session.id,
        randomizerSlug: session.randomizer_slug,
      };
    }
  }

  if (!resolved) {
    return NextResponse.json({
      ok: true,
      broadcaster: connection.twitch_display_name,
      session: null,
      shuffle: null,
    });
  }

  const shuffle = await getLatestTwitchShuffleEvent(resolved.id, {
    broadcasterOnly: true,
    since,
  });

  return NextResponse.json({
    ok: true,
    broadcaster: connection.twitch_display_name,
    session: {
      id: resolved.id,
      randomizerSlug: resolved.randomizerSlug,
    },
    shuffle: shuffle
      ? {
          id: shuffle.id,
          displayName: shuffle.twitch_display_name,
          combo: shuffle.combo,
          createdAt: shuffle.created_at,
        }
      : null,
  });
}
