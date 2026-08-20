/**
 * GET / PATCH /api/discord/bot/qotd
 *
 * The QOTD management surface for the Discord Bot tab:
 *   GET   → today's question preview + counts (unused/total), the streamer's
 *           own questions (editable via the command-pool routes), the qotd
 *           command id, and the engine settings.
 *   PATCH → engine settings ({ allow_repeats?, low_silenced? }).
 *
 * Question add/edit/remove goes through the existing
 * /api/account/command-pool/[commandId] routes (this returns commandId).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import { computeQotdState, QOTD_TRIGGER, QOTD_LOW_THRESHOLD } from "@/lib/qotd";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const communityId = await resolveCommunityIdForOwner(user.id);
  if (!communityId) {
    return NextResponse.json({ ok: true, hasCommunity: false });
  }

  const admin = createServiceClient();

  const { data: cmdRow } = await admin
    .from("gs_default_commands")
    .select("id")
    .eq("trigger", QOTD_TRIGGER)
    .maybeSingle();
  const commandId = (cmdRow as { id: string } | null)?.id ?? null;

  // The streamer's own questions (editable); GameShuffle defaults stay implicit.
  let questions: { id: string; response: string; enabled: boolean }[] = [];
  if (commandId) {
    const { data } = await admin
      .from("gs_default_command_responses")
      .select("id, response, enabled, sort_order, created_at")
      .eq("command_id", commandId)
      .eq("community_id", communityId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    questions = ((data as { id: string; response: string; enabled: boolean }[] | null) ?? []).map(
      ({ id, response, enabled }) => ({ id, response, enabled }),
    );
  }

  const state = await computeQotdState(communityId);

  const { data: settings } = await admin
    .from("users")
    .select("discord_qotd_allow_repeats, discord_qotd_low_silenced")
    .eq("id", user.id)
    .maybeSingle();
  const s = settings as {
    discord_qotd_allow_repeats: boolean | null;
    discord_qotd_low_silenced: boolean | null;
  } | null;

  return NextResponse.json({
    ok: true,
    hasCommunity: true,
    commandId,
    lowThreshold: QOTD_LOW_THRESHOLD,
    today: {
      question: state.pick?.question ?? null,
      claimed: state.claimed,
      remaining: state.remaining,
      total: state.total,
      exhausted: state.exhausted,
      paused: state.paused,
      // How many of the pool are the streamer's own (enabled).
      yours: questions.filter((q) => q.enabled).length,
    },
    questions,
    settings: {
      allowRepeats: !!s?.discord_qotd_allow_repeats,
      // UI framing is "warn me" (on by default), stored as its inverse.
      warnWhenLow: !s?.discord_qotd_low_silenced,
    },
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  let body: { allow_repeats?: boolean; warn_when_low?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.allow_repeats === "boolean") {
    updates.discord_qotd_allow_repeats = body.allow_repeats;
  }
  if (typeof body.warn_when_low === "boolean") {
    updates.discord_qotd_low_silenced = !body.warn_when_low;
    // Re-arming the warning should clear a stale "already notified" marker.
    if (body.warn_when_low) updates.discord_qotd_low_notified_at = null;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await createServiceClient()
    .from("users")
    .update(updates)
    .eq("id", user.id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
