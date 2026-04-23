/**
 * POST /api/twitch/subscriptions/sync
 *
 * Backfills EventSub subscriptions for the authenticated user's connection.
 * Idempotent: creates only types that aren't already enabled. Used after
 * adding new subscription types (e.g. channel.chat.message in Phase 2) so
 * existing streamers don't have to disconnect and reconnect.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTwitchAdminClient } from "@/lib/twitch/admin";
import { syncSubscriptionsForConnection } from "@/lib/twitch/eventsub";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const admin = createTwitchAdminClient();
  const { data: connection } = await admin
    .from("twitch_connections")
    .select("twitch_user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!connection?.twitch_user_id) {
    return NextResponse.json({ error: "not_connected" }, { status: 400 });
  }

  const result = await syncSubscriptionsForConnection({
    userId: user.id,
    twitchUserId: connection.twitch_user_id,
  });

  return NextResponse.json({
    created: result.created.map((s) => ({ type: s.type, id: s.id, status: s.status })),
    alreadyPresent: result.alreadyPresent,
    failures: result.failures,
  });
}
