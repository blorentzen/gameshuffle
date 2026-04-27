/**
 * POST /api/twitch/sessions/test
 *
 * Body: { action: 'start' } | { action: 'end' }
 *
 * Starts/ends a test session. Test sessions exist purely to flip the bot
 * "on" without requiring an actual stream.online event — the streamer's
 * current Twitch category is still the source of truth for which
 * randomizer the bot uses. If they change category mid-test, the
 * channel.update webhook updates the test session in place; commands
 * that hit a session with no supported slug reply with the standard
 * "we don't support this game" message.
 *
 * Phase 1 maps test sessions onto the new generic gs_sessions table with
 * `feature_flags.test_session = true` (per addendum §16.4). The visible
 * "test" status is reconstructed by the twitch-bridge from that flag.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTwitchAdminClient } from "@/lib/twitch/admin";
import { getChannelInfo } from "@/lib/twitch/client";
import { resolveRandomizerSlug } from "@/lib/twitch/categories";
import { ensureBroadcasterInSession } from "@/lib/twitch/commands/participants";
import { ensureSessionModule } from "@/lib/modules/store";
import {
  createTwitchSession,
  endTwitchSession,
  findTwitchSessionForUser,
} from "@/lib/sessions/twitch-bridge";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body.action as string | undefined;

  if (action === "end") {
    const existing = await findTwitchSessionForUser(user.id, ["test"]);
    if (existing) {
      try {
        await endTwitchSession(existing.id);
      } catch (err) {
        console.error("[twitch-test-session] end failed:", err);
        return NextResponse.json({ error: "end_failed" }, { status: 500 });
      }
    }
    return NextResponse.json({ success: true });
  }

  if (action !== "start") {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  // Refuse to start a test session while a real one is active — would
  // confuse the dashboard and double up sessions for !gs-shuffle to choose
  // between.
  const existing = await findTwitchSessionForUser(user.id, ["active", "test"]);
  if (existing) {
    return NextResponse.json(
      { error: "session_already_active", currentStatus: existing.status },
      { status: 409 }
    );
  }

  // Snapshot the current Twitch category. Either field can be null when
  // the streamer is on an unsupported game (or hasn't set one) — the
  // session still gets created so the bot can respond to !gs-* with a
  // friendly "not supported" message.
  const admin = createTwitchAdminClient();
  const { data: connection } = await admin
    .from("twitch_connections")
    .select("twitch_user_id, twitch_login, twitch_display_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!connection?.twitch_user_id) {
    return NextResponse.json({ error: "not_connected" }, { status: 400 });
  }

  let categoryId: string | null = null;
  let randomizerSlug: string | null = null;
  try {
    const channel = await getChannelInfo(connection.twitch_user_id);
    categoryId = channel?.game_id || null;
    const categoryName = channel?.game_name || null;
    randomizerSlug = await resolveRandomizerSlug(categoryId, categoryName);
  } catch (err) {
    console.error("[twitch-test-session] Helix lookup failed:", err);
    // Continue with nulls — the streamer can switch their Twitch category
    // mid-test and channel.update will populate the slug.
  }

  const inserted = await createTwitchSession({
    userId: user.id,
    randomizerSlug,
    twitchCategoryId: categoryId,
    isTest: true,
  });

  if (!inserted) {
    return NextResponse.json({ error: "start_failed" }, { status: 500 });
  }

  // Streamer is always in their own lobby — auto-seat them so they show
  // up in !gs-lobby and don't have to !gs-join their own session.
  await ensureBroadcasterInSession({
    sessionId: inserted.id,
    twitchUserId: connection.twitch_user_id,
    twitchLogin: connection.twitch_login ?? connection.twitch_user_id,
    twitchDisplayName:
      connection.twitch_display_name ?? connection.twitch_login ?? connection.twitch_user_id,
  });

  // Auto-enable kart_randomizer module so a test session has the same
  // module footprint as a live one.
  await ensureSessionModule({
    sessionId: inserted.id,
    moduleId: "kart_randomizer",
  });

  return NextResponse.json({
    success: true,
    session: { id: inserted.id, started_at: inserted.started_at, randomizer_slug: inserted.randomizer_slug },
    supported: !!randomizerSlug,
  });
}
