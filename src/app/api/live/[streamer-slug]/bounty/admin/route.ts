/**
 * POST /api/live/[streamer-slug]/bounty/admin
 *
 * Host-only tactile control for bounties — mirrors the chat
 * commands `!gs bounty <amount> <desc>` / `!gs bounty award @user` /
 * `!gs bounty cancel`.
 *
 * Body shapes:
 *   { action: 'open', amount: number, description: string }
 *   { action: 'cancel', bountyId: string }
 *   { action: 'award', bountyId: string, targetTwitchLogin: string }
 *
 * Auth: caller must be the community owner. The streamer's
 * gs_identities row is required to fund the bounty (reservation
 * tracking).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { ensureActiveStream } from "@/lib/economy/streams";
import {
  cancelBounty,
  openBounty,
  settleBounty,
} from "@/lib/economy/bounties";
import { resolveIdentity } from "@/lib/economy/identity";
import { getUserByLogin } from "@/lib/twitch/client";
import { getValidUserAccessToken } from "@/lib/twitch/userToken";

export const runtime = "nodejs";

type Action = "open" | "cancel" | "award";

interface RequestBody {
  action?: Action;
  amount?: number;
  description?: string;
  bountyId?: string;
  targetTwitchLogin?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ "streamer-slug": string }> },
) {
  const { "streamer-slug": slug } = await params;
  if (!slug) {
    return NextResponse.json({ error: "missing_slug" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  if (!viewer) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const action = body.action;
  if (!action || !["open", "cancel", "award"].includes(action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data: streamer } = await admin
    .from("users")
    .select("id, username, twitch_username, display_name")
    .or(`username.eq.${slug},twitch_username.eq.${slug}`)
    .maybeSingle();
  if (!streamer) {
    return NextResponse.json({ error: "streamer_not_found" }, { status: 404 });
  }
  const streamerRecord = streamer as {
    id: string;
    username: string | null;
    twitch_username: string | null;
    display_name: string | null;
  };
  const streamerId = streamerRecord.id;

  // Verify caller is the community owner.
  const viewerTwitchIdentity = (viewer.identities ?? []).find(
    (i) => i.provider === "twitch",
  );
  const viewerTwitchId =
    (viewerTwitchIdentity?.identity_data?.sub as string | undefined) ??
    (viewerTwitchIdentity?.identity_data?.provider_id as string | undefined) ??
    null;
  if (!viewerTwitchId) {
    return NextResponse.json(
      { error: "twitch_identity_required" },
      { status: 403 },
    );
  }
  const { data: callerIdentity } = await admin
    .from("gs_identities")
    .select("id")
    .eq("platform", "twitch")
    .eq("platform_id", viewerTwitchId)
    .maybeSingle();
  if (!callerIdentity) {
    return NextResponse.json({ error: "no_identity" }, { status: 403 });
  }
  const callerIdentityId = (callerIdentity as { id: string }).id;

  const communitySlug = streamerRecord.username ?? streamerRecord.twitch_username ?? slug;
  const { data: community } = await admin
    .from("gs_communities")
    .select("id, owner_identity_id")
    .eq("slug", communitySlug)
    .maybeSingle();
  if (!community) {
    return NextResponse.json({ error: "community_not_found" }, { status: 404 });
  }
  if (
    (community as { owner_identity_id: string }).owner_identity_id !==
    callerIdentityId
  ) {
    return NextResponse.json({ error: "not_owner" }, { status: 403 });
  }
  const communityId = (community as { id: string }).id;

  // ---- open ------------------------------------------------------------
  if (action === "open") {
    const amount = Number(body.amount);
    const description = (body.description ?? "").trim();
    if (!Number.isInteger(amount) || amount <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
    }
    if (!description) {
      return NextResponse.json(
        { error: "missing_description" },
        { status: 400 },
      );
    }
    const stream = await ensureActiveStream({ communityId });

    // Active session + game key for chapter/game_key pin.
    const { data: sessionRow } = await admin
      .from("gs_sessions")
      .select("id, active_game, configured_games, config")
      .eq("owner_user_id", streamerId)
      .in("status", ["active", "ending"])
      .order("activated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    const sessionId = (sessionRow as { id?: string } | null)?.id ?? null;
    const rawGame =
      (sessionRow as { active_game?: string | null } | null)?.active_game ??
      ((sessionRow as { configured_games?: string[] | null } | null)?.configured_games?.[0] ?? null) ??
      (((sessionRow as { config?: { game?: string | null } | null } | null)?.config?.game) ?? null);

    const result = await openBounty({
      communityId,
      streamId: stream.id,
      sessionId,
      chapter: null,
      gameKey: rawGame,
      amount,
      description,
      createdByIdentityId: callerIdentityId,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.reason, ceiling: result.ceiling, consumed: result.consumed },
        { status: 409 },
      );
    }
    return NextResponse.json({
      ok: true,
      bounty: {
        id: result.bountyId,
        amount: result.amount,
        ceiling: result.ceiling,
        consumed: result.consumed,
      },
    });
  }

  const bountyId = body.bountyId;
  if (!bountyId) {
    return NextResponse.json({ error: "missing_bounty_id" }, { status: 400 });
  }

  // ---- cancel ----------------------------------------------------------
  if (action === "cancel") {
    const result = await cancelBounty(bountyId);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 409 });
    }
    return NextResponse.json({ ok: true, released: result.released });
  }

  // ---- award -----------------------------------------------------------
  const targetLogin = (body.targetTwitchLogin ?? "").replace(/^@/, "").toLowerCase();
  if (!targetLogin) {
    return NextResponse.json(
      { error: "missing_target_login" },
      { status: 400 },
    );
  }
  // Resolve the target login → twitch_user_id → gs_identities via
  // Helix (same helper the chat handler uses).
  let targetIdentityId: string | null = null;
  try {
    const token = await getValidUserAccessToken(streamerId);
    const helixUser = await getUserByLogin(targetLogin, token);
    if (helixUser) {
      const resolved = await resolveIdentity({
        platform: "twitch",
        platformId: helixUser.id,
        displayName: helixUser.display_name,
      });
      targetIdentityId = resolved.identityId;
    }
  } catch (err) {
    console.error("[bounty admin] helix lookup failed", err);
  }
  if (!targetIdentityId) {
    return NextResponse.json(
      { error: "target_not_found" },
      { status: 404 },
    );
  }

  const result = await settleBounty({
    bountyId,
    toIdentityId: targetIdentityId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }
  return NextResponse.json({
    ok: true,
    minted: result.minted,
    bountyId: result.bountyId,
    eventId: result.eventId,
  });
}
