/**
 * POST /api/twitch/overlay/regenerate
 *
 * Generates a fresh overlay_token for the authenticated streamer,
 * invalidating the previous one immediately. Used when the URL leaks
 * (e.g. streamer accidentally shows their OBS sources panel on stream).
 *
 * The old /overlay/[old-token] and /lobby/[old-token] URLs return 404
 * the moment this endpoint returns. Streamer must update their OBS
 * browser source to the new URL.
 */

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createTwitchAdminClient } from "@/lib/twitch/admin";

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
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ error: "not_connected" }, { status: 400 });
  }

  const newToken = randomBytes(24).toString("base64url");
  const { error } = await admin
    .from("twitch_connections")
    .update({ overlay_token: newToken, updated_at: new Date().toISOString() })
    .eq("id", connection.id);

  if (error) {
    console.error("[twitch-overlay-regenerate] update failed:", error);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true, overlayToken: newToken });
}
