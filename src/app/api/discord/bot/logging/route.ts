/**
 * GET / PATCH /api/discord/bot/logging
 *
 * The streamer's server-logging config (Pro). GET returns the log channel +
 * per-event toggles; PATCH saves them. The gateway worker reads these and posts
 * message deletes/edits, joins/leaves, and role changes to the channel.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

interface LogEvents {
  message_delete?: boolean;
  message_edit?: boolean;
  member_join?: boolean;
  member_leave?: boolean;
  role_change?: boolean;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const { data } = await createServiceClient()
    .from("users")
    .select("discord_log_channel_id, discord_log_events")
    .eq("id", user.id)
    .maybeSingle();
  const row = data as { discord_log_channel_id: string | null; discord_log_events: LogEvents | null } | null;
  return NextResponse.json({
    ok: true,
    channelId: row?.discord_log_channel_id ?? null,
    events: row?.discord_log_events ?? null,
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  let body: { channel_id?: string | null; events?: LogEvents };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.channel_id !== undefined) updates.discord_log_channel_id = body.channel_id;
  if (body.events !== undefined) updates.discord_log_events = body.events;
  if (Object.keys(updates).length === 0) return NextResponse.json({ ok: true });

  const { error } = await createServiceClient().from("users").update(updates).eq("id", user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
