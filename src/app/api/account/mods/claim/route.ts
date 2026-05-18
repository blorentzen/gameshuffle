/**
 * POST /api/account/mods/claim
 *
 * Final step of the mod-invite flow. The streamer generated an invite
 * token, the recipient signed in to GS (which ran the cross-surface
 * identity merge, backfilling `gs_user_id` on the matching streamer_mods
 * row), and now they're clicking "Accept" on the claim landing page.
 *
 * Validation chain:
 *   1. Caller is authenticated
 *   2. Token exists, status = 'invited', not expired
 *   3. Row's `gs_user_id` matches the caller — set by the identity merge.
 *      If it's still NULL, the user signed in with an identity that
 *      doesn't match the row's target (forwarded link / wrong account).
 *
 * On success: flips status → 'active', clears invite_token, sets
 * claimed_at. Returns the streamer's identifier so the client can route
 * to `/mod/[streamer]`.
 */

import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

interface ClaimBody {
  token: string;
}

export async function POST(request: Request) {
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

  let body: ClaimBody;
  try {
    body = (await request.json()) as ClaimBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_body" },
      { status: 400 },
    );
  }
  if (!body.token) {
    return NextResponse.json(
      { ok: false, error: "token_required" },
      { status: 400 },
    );
  }

  const admin = createServiceClient();

  // Pull the row by token. Service role so RLS doesn't block the
  // pre-claim lookup (the mod's own-row policy is keyed on
  // status='active' which we haven't flipped yet).
  const { data: row } = await admin
    .from("streamer_mods")
    .select(
      "id, streamer_user_id, gs_user_id, twitch_user_id, discord_user_id, status, invite_expires_at",
    )
    .eq("invite_token", body.token)
    .maybeSingle();
  if (!row) {
    return NextResponse.json(
      { ok: false, error: "invite_not_found" },
      { status: 404 },
    );
  }
  if (row.status !== "invited") {
    return NextResponse.json(
      { ok: false, error: "invite_not_open" },
      { status: 409 },
    );
  }
  if (
    row.invite_expires_at &&
    new Date(row.invite_expires_at).getTime() < Date.now()
  ) {
    return NextResponse.json(
      { ok: false, error: "invite_expired" },
      { status: 410 },
    );
  }

  // Identity match check — gs_user_id is populated by the cross-surface
  // identity merge that runs on every OAuth callback. If it's still
  // null, the caller signed in with a different identity than the one
  // the invite was sent to.
  if (row.gs_user_id !== null && row.gs_user_id !== user.id) {
    return NextResponse.json(
      { ok: false, error: "invite_for_different_account" },
      { status: 403 },
    );
  }
  if (row.gs_user_id === null) {
    // Belt + suspenders: re-run the merge using the user's stored
    // identity columns. This handles the edge case where the user
    // signed in WITHOUT the matching provider linked yet — we tell
    // them which provider to link.
    const { data: profile } = await admin
      .from("users")
      .select("twitch_id, discord_id")
      .eq("id", user.id)
      .maybeSingle();
    const userTwitch = (profile as { twitch_id: string | null } | null)?.twitch_id;
    const userDiscord = (profile as { discord_id: string | null } | null)?.discord_id;
    const twitchMatches =
      row.twitch_user_id !== null && row.twitch_user_id === userTwitch;
    const discordMatches =
      row.discord_user_id !== null && row.discord_user_id === userDiscord;
    if (!twitchMatches && !discordMatches) {
      const needed = row.twitch_user_id ? "twitch" : "discord";
      return NextResponse.json(
        { ok: false, error: "identity_link_required", needed },
        { status: 403 },
      );
    }
    // The merge would have fired this on login; the user might have
    // landed here via a stale session. Run the rebind now so the next
    // step is a clean activation.
    await admin
      .from("streamer_mods")
      .update({ gs_user_id: user.id })
      .eq("id", row.id);
  }

  // Activate. Clears the invite token so the link can't be reused.
  const { error: activateErr } = await admin
    .from("streamer_mods")
    .update({
      status: "active",
      claimed_at: new Date().toISOString(),
      invite_token: null,
      invite_expires_at: null,
      updated_at: new Date().toISOString(),
      gs_user_id: user.id,
    })
    .eq("id", row.id);
  if (activateErr) {
    console.error("[mods/claim] activate failed:", activateErr);
    return NextResponse.json(
      { ok: false, error: activateErr.message },
      { status: 500 },
    );
  }

  // Look up the streamer's slug for the post-claim redirect.
  const { data: streamer } = await admin
    .from("users")
    .select("username, twitch_username, display_name")
    .eq("id", row.streamer_user_id)
    .maybeSingle();
  const streamerProfile = streamer as {
    username: string | null;
    twitch_username: string | null;
    display_name: string | null;
  } | null;
  const streamerSlug =
    streamerProfile?.username ?? streamerProfile?.twitch_username ?? row.streamer_user_id;
  const streamerName =
    streamerProfile?.display_name ?? streamerProfile?.username ?? streamerSlug;

  return NextResponse.json({
    ok: true,
    streamerSlug,
    streamerName,
  });
}
