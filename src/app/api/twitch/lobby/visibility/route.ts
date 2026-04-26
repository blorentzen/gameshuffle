/**
 * POST /api/twitch/lobby/visibility
 *
 * Toggles `twitch_connections.public_lobby_enabled` for the authenticated
 * streamer. Honors the visibility-controls migration P0 commitment that
 * a streamer can disable the public /lobby/[token] viewer.
 *
 * Body: { enabled: boolean }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTwitchAdminClient } from "@/lib/twitch/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "missing_enabled" }, { status: 400 });
  }

  const admin = createTwitchAdminClient();
  const { error } = await admin
    .from("twitch_connections")
    .update({ public_lobby_enabled: body.enabled, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (error) {
    console.error("[twitch/lobby/visibility] update failed:", error);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true, enabled: body.enabled });
}
