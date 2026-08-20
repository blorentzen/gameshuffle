/**
 * GET / PATCH / DELETE /api/discord/bot/routing
 *
 * The streamer's GameShuffle-bot routing configuration:
 *   - guild_id / guild_name  (installed via /api/discord/bot/install/*)
 *   - channel_id             (selected by the streamer from the channel picker)
 *   - notify_role_id         (optional ping role)
 *   - event_subscriptions    (per-event POST on/off — defaults ON, except
 *                             `qotd` which is opt-in / defaults OFF)
 *   - event_pings            (per-event @-mention on/off — defaults OFF;
 *                             only fires when the matching subscription
 *                             is ALSO on AND a notify_role_id is set)
 *
 * DELETE clears all of the above — does NOT remove the bot from Discord
 * (the streamer still has to kick the bot from their server) but stops
 * GameShuffle from posting anything new.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

interface EventFlags {
  stream_live?: boolean;
  round_open?: boolean;
  round_close?: boolean;
  recap?: boolean;
  /** Daily Question-of-the-Day post. Unlike the others this defaults OFF
   *  (it posts on a schedule, not in reaction to the streamer) — see
   *  SUB_DEFAULTS in `src/lib/adapters/discord/index.ts`. */
  qotd?: boolean;
}

interface RoutingBody {
  channel_id?: string | null;
  notify_role_id?: string | null;
  event_subscriptions?: EventFlags;
  event_pings?: EventFlags;
  qotd_hour?: number | null;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }
  const admin = createServiceClient();
  const { data } = await admin
    .from("users")
    .select(
      "discord_guild_id, discord_guild_name, discord_channel_id, discord_notify_role_id, discord_event_subscriptions, discord_event_pings, discord_qotd_hour",
    )
    .eq("id", user.id)
    .maybeSingle();
  const row = data as {
    discord_guild_id: string | null;
    discord_guild_name: string | null;
    discord_channel_id: string | null;
    discord_notify_role_id: string | null;
    discord_event_subscriptions: EventFlags | null;
    discord_event_pings: EventFlags | null;
    discord_qotd_hour: number | null;
  } | null;
  return NextResponse.json({
    ok: true,
    routing: {
      guildId: row?.discord_guild_id ?? null,
      guildName: row?.discord_guild_name ?? null,
      channelId: row?.discord_channel_id ?? null,
      notifyRoleId: row?.discord_notify_role_id ?? null,
      eventSubscriptions: row?.discord_event_subscriptions ?? null,
      eventPings: row?.discord_event_pings ?? null,
      qotdHour: row?.discord_qotd_hour ?? null,
    },
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }
  let body: RoutingBody;
  try {
    body = (await request.json()) as RoutingBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_body" },
      { status: 400 },
    );
  }
  const updates: Record<string, unknown> = {};
  if (body.channel_id !== undefined) {
    updates.discord_channel_id = body.channel_id;
  }
  if (body.notify_role_id !== undefined) {
    updates.discord_notify_role_id = body.notify_role_id;
  }
  if (body.event_subscriptions !== undefined) {
    updates.discord_event_subscriptions = body.event_subscriptions;
  }
  if (body.event_pings !== undefined) {
    updates.discord_event_pings = body.event_pings;
  }
  if (body.qotd_hour !== undefined) {
    updates.discord_qotd_hour =
      typeof body.qotd_hour === "number" ? Math.min(23, Math.max(0, Math.round(body.qotd_hour))) : null;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true });
  }
  const admin = createServiceClient();
  const { error } = await admin.from("users").update(updates).eq("id", user.id);
  if (error) {
    console.error("[discord-bot-routing] update failed:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }
  const admin = createServiceClient();
  const { error } = await admin
    .from("users")
    .update({
      discord_guild_id: null,
      discord_guild_name: null,
      discord_channel_id: null,
      discord_notify_role_id: null,
    })
    .eq("id", user.id);
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
