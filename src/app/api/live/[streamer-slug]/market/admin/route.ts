/**
 * POST /api/live/[streamer-slug]/market/admin
 *
 * Host-only tactile control surface — mirrors the chat commands
 * `!gs market open` / `lock` / `close` / `!gs resolve` so streamers
 * can drive the market from the live page hub instead of chat.
 *
 * Body: { action: 'open' | 'lock' | 'close' | 'resolve',
 *         lockMinutes?: 1 | 3 | 5, value?: string }
 *
 * Auth: caller must be the community owner (resolved via Supabase
 * auth → gs_identities → gs_communities.owner_identity_id). Any
 * other authenticated viewer gets 403; unauthenticated gets 401.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  cancelMarket,
  findActiveMarket,
  lockMarket,
  openMarket,
  resolveMarket,
} from "@/lib/economy/markets/lifecycle";
import { ensureActiveStream } from "@/lib/economy/streams";

export const runtime = "nodejs";

type Action = "open" | "lock" | "close" | "resolve";

interface RequestBody {
  action?: Action;
  lockMinutes?: 1 | 3 | 5;
  value?: string;
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
  if (!action || !["open", "lock", "close", "resolve"].includes(action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  // Resolve the streamer + community + verify caller is the owner.
  const admin = createServiceClient();
  const { data: streamer } = await admin
    .from("users")
    .select("id, username, twitch_username, display_name")
    .or(`username.eq.${slug},twitch_username.eq.${slug}`)
    .maybeSingle();
  if (!streamer) {
    return NextResponse.json({ error: "streamer_not_found" }, { status: 404 });
  }
  const streamerId = (streamer as { id: string }).id;

  // Caller's gs_identities (twitch) row.
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

  const { data: community } = await admin
    .from("gs_communities")
    .select("id, owner_identity_id")
    .eq("slug", (streamer as { username?: string | null; twitch_username?: string | null }).username ??
                  (streamer as { twitch_username?: string | null }).twitch_username ??
                  slug)
    .maybeSingle();
  if (!community) {
    return NextResponse.json({ error: "community_not_found" }, { status: 404 });
  }
  if (
    (community as { owner_identity_id: string }).owner_identity_id !==
    (callerIdentity as { id: string }).id
  ) {
    return NextResponse.json({ error: "not_owner" }, { status: 403 });
  }
  const communityId = (community as { id: string }).id;

  // Resolve active session + game key.
  const { data: sessionRow } = await admin
    .from("gs_sessions")
    .select("id, status, active_game, configured_games, config")
    .eq("owner_user_id", streamerId)
    .in("status", ["active", "ending"])
    .order("activated_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!sessionRow) {
    return NextResponse.json({ error: "no_active_session" }, { status: 409 });
  }
  const sessionId = (sessionRow as { id: string }).id;
  const rawGame =
    (sessionRow as { active_game?: string | null }).active_game ??
    ((sessionRow as { configured_games?: string[] | null }).configured_games?.[0] ?? null) ??
    (((sessionRow as { config?: { game?: string | null } | null }).config?.game) ?? null);
  const gameKey = canonicalizeGameKey(rawGame);
  if (!gameKey) {
    return NextResponse.json({ error: "game_not_supported" }, { status: 409 });
  }

  // ----- Dispatch by action ---------------------------------------------
  if (action === "open") {
    const stream = await ensureActiveStream({ communityId });
    const lockMinutes = ([1, 3, 5] as const).includes(
      (body.lockMinutes ?? 1) as 1 | 3 | 5,
    )
      ? ((body.lockMinutes ?? 1) as 1 | 3 | 5)
      : 1;
    const result = await openMarket({
      communityId,
      streamId: stream.id,
      sessionId,
      gameKey,
      chapter: 1,
      subject:
        (streamer as { display_name?: string | null }).display_name ?? slug,
      hostIdentityId: (callerIdentity as { id: string }).id,
      lockMinutes,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.reason, detail: result.detail },
        { status: 409 },
      );
    }
    return NextResponse.json({
      ok: true,
      market: { id: result.market.id, lockMinutes },
      outcomes: result.outcomes.map((o) => ({
        id: o.id,
        optionKey: o.option_key,
        label: o.label,
      })),
    });
  }

  // For lock/close/resolve, look up the current active market.
  const market = await findActiveMarket({ sessionId, gameKey });
  if (!market) {
    return NextResponse.json({ error: "no_active_market" }, { status: 409 });
  }

  if (action === "lock") {
    const result = await lockMarket({ marketId: market.id });
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "close") {
    const result = await cancelMarket({
      marketId: market.id,
      reason: "manual",
    });
    return NextResponse.json({
      ok: result.ok,
      refundedBets: result.refundedBets,
    });
  }

  // action === "resolve"
  const value = (body.value ?? "").trim();
  if (!value) {
    return NextResponse.json({ error: "missing_value" }, { status: 400 });
  }
  // Auto-lock if still open — chat handler does the same.
  let resolveTarget = market;
  if (resolveTarget.status === "open") {
    const lockResult = await lockMarket({ marketId: market.id });
    if (lockResult.ok) resolveTarget = lockResult.market;
  }
  if (resolveTarget.status !== "locked") {
    return NextResponse.json({ error: "market_not_lockable" }, { status: 409 });
  }
  const result = await resolveMarket({
    marketId: resolveTarget.id,
    value,
    resolverIdentityId: (callerIdentity as { id: string }).id,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }
  return NextResponse.json({
    ok: true,
    pools: result.pools,
  });
}

function canonicalizeGameKey(slug: string | null): string | null {
  if (slug === "mk8dx" || slug === "mario-kart-8-deluxe") {
    return "mario-kart-8-deluxe";
  }
  if (slug === "mkworld" || slug === "mario-kart-world") {
    return "mario-kart-world";
  }
  return null;
}
