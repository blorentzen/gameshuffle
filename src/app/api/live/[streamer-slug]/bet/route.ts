/**
 * POST /api/live/[streamer-slug]/bet
 *
 * Body: { marketId: string, optionKey: string, amount: number | string }
 *
 * Web-tactile companion to `!bet` chat. Authenticated viewers on
 * /live/[slug] click an option, this endpoint places the stake.
 *
 * Auth: viewer must be Twitch-signed-in via Supabase OAuth. We pull
 * their Twitch identity off the auth.users.identities payload and
 * route to `resolveIdentity` for the gs_identities row (Tier 0 row
 * gets lazy-created + starting grant fires on first contact — Spec
 * 01's web activation surface).
 *
 * Validation chain:
 *   1. Streamer slug resolves to a users row.
 *   2. Streamer has an active gs_session.
 *   3. Caller has a Twitch identity (OAuth provider sub).
 *   4. Market exists, belongs to the streamer's active session.
 *   5. placeBet succeeds (open market + sufficient balance).
 *
 * Returns: { balance, pools: MarketPool[], bet: {...} } so the live
 * page can refresh its pool/balance view without a follow-up GET.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveIdentity } from "@/lib/economy/identity";
import { ensureCommunity } from "@/lib/economy/community";
import { ensureActiveStream } from "@/lib/economy/streams";
import { getBalance, parseAmount } from "@/lib/economy/tokens";
import {
  getMarketPools,
  placeBet,
} from "@/lib/economy/markets/lifecycle";
import { placeSpectatorPick } from "@/lib/economy/markets/spectator";
import { checkCompliance } from "@/lib/economy/compliance/gate";
import { resolveRegionFromRequest } from "@/lib/economy/compliance/region";

export const runtime = "nodejs";

interface RequestBody {
  marketId?: string;
  optionKey?: string;
  /** Accepts int, "all", or "N%" — same grammar as !bet. */
  amount?: string | number;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ "streamer-slug": string }> },
) {
  const { "streamer-slug": slug } = await params;
  if (!slug) {
    return NextResponse.json({ error: "missing_slug" }, { status: 400 });
  }

  // ---- 1. Auth ----------------------------------------------------------
  const supabase = await createClient();
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  if (!viewer) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const { marketId, optionKey, amount: amountRaw } = body;
  if (
    !marketId ||
    typeof marketId !== "string" ||
    !optionKey ||
    typeof optionKey !== "string" ||
    amountRaw === undefined ||
    amountRaw === null
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // ---- 2. Streamer + community + active stream --------------------------
  const admin = createServiceClient();
  const fields = "id, username, twitch_username, display_name";
  const { data: byUsername } = await admin
    .from("users")
    .select(fields)
    .eq("username", slug)
    .maybeSingle();
  const streamer =
    byUsername ??
    (
      await admin
        .from("users")
        .select(fields)
        .eq("twitch_username", slug)
        .limit(1)
        .maybeSingle()
    ).data;
  if (!streamer) {
    return NextResponse.json({ error: "streamer_not_found" }, { status: 404 });
  }

  // The streamer's Twitch identity row anchors the community owner.
  // Without a twitch_connections row we can't tie the broadcast to a
  // gs_communities owner — surface a clean error rather than fudging it.
  const { data: streamerConnection } = await admin
    .from("twitch_connections")
    .select("twitch_user_id, twitch_login, display_name")
    .eq("user_id", (streamer as { id: string }).id)
    .maybeSingle();
  if (!streamerConnection?.twitch_user_id) {
    return NextResponse.json(
      { error: "streamer_not_twitch_connected" },
      { status: 400 },
    );
  }

  const streamerDisplayName =
    ((streamer as { display_name?: string | null }).display_name ?? null) ||
    (streamerConnection.display_name as string | null) ||
    (streamerConnection.twitch_login as string | null) ||
    slug;
  const streamerSlug =
    ((streamer as { username?: string | null }).username ?? null) ||
    ((streamer as { twitch_username?: string | null }).twitch_username ?? null) ||
    slug;

  const broadcasterResolved = await resolveIdentity({
    platform: "twitch",
    platformId: streamerConnection.twitch_user_id as string,
    displayName: streamerDisplayName,
  });
  const community = await ensureCommunity({
    ownerIdentityId: broadcasterResolved.identityId,
    slug: streamerSlug,
    displayName: streamerDisplayName,
  });
  const stream = await ensureActiveStream({ communityId: community.id });

  // ---- 3. Active session must exist + match the market ------------------
  const { data: sessionRow } = await admin
    .from("gs_sessions")
    .select("id, owner_user_id, status, active_game, configured_games, config")
    .eq("owner_user_id", (streamer as { id: string }).id)
    .in("status", ["active", "ending"])
    .order("activated_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!sessionRow) {
    return NextResponse.json({ error: "no_active_session" }, { status: 409 });
  }

  // ---- 4. Caller's Twitch identity -------------------------------------
  // The viewer's Twitch sub is the durable identifier — Helix and
  // Supabase Auth both expose it under `identities[*].identity_data.sub`
  // (canonical) with `provider_id` as a fallback that older identities
  // populate. Falling back to user.id would let an email-only viewer
  // bet under a synthetic identity, which would NOT survive a later
  // Twitch link — we'd lose their stake on merge. Reject instead.
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
  const viewerDisplayName =
    (viewerTwitchIdentity?.identity_data?.preferred_username as string | undefined) ??
    (viewerTwitchIdentity?.identity_data?.name as string | undefined) ??
    (viewer.email as string | undefined) ??
    "viewer";

  // resolveIdentity lazily creates + fires starting grant on first hit.
  // This is the web-activation surface — viewers who bet from the
  // /live page for the first time create their identity here.
  const callerResolved = await resolveIdentity({
    platform: "twitch",
    platformId: viewerTwitchId,
    displayName: viewerDisplayName,
  });
  const callerIdentityId = callerResolved.identityId;

  // First-touch welcome chat post — fires once per viewer regardless
  // of whether they enter via chat or web. Posted to the streamer's
  // chat (not whispered) so the streamer sees the engagement and so
  // any future commands the viewer runs aren't preceded by silence.
  if (callerResolved.isNew) {
    const botTwitchId = process.env.TWITCH_BOT_USER_ID;
    if (botTwitchId) {
      const { postFirstTouchWelcome } = await import("@/lib/economy/welcome");
      void postFirstTouchWelcome({
        broadcasterTwitchId: streamerConnection.twitch_user_id as string,
        botTwitchId,
        senderDisplayName: viewerDisplayName,
        grantBalance: callerResolved.balance,
        streamerUserId: (streamer as { id: string }).id,
      });
    }
  }

  // ---- 5. Market belongs to this session -------------------------------
  const { data: marketRow } = await admin
    .from("gs_markets")
    .select(
      "id, community_id, stream_id, session_id, game_key, chapter, status",
    )
    .eq("id", marketId)
    .maybeSingle();
  if (!marketRow) {
    return NextResponse.json({ error: "market_not_found" }, { status: 404 });
  }
  if ((marketRow as { session_id: string }).session_id !== sessionRow.id) {
    // The market exists but isn't tied to this streamer's current
    // session — refuse rather than silently bet on a stale market.
    return NextResponse.json({ error: "market_session_mismatch" }, { status: 409 });
  }
  if ((marketRow as { stream_id: string }).stream_id !== stream.id) {
    // Different broadcast cycle (recovery / re-open). Same intent —
    // the bet doesn't belong on this market.
    return NextResponse.json({ error: "market_stream_mismatch" }, { status: 409 });
  }

  // ---- 6. Compliance gate (Spec 07) ------------------------------------
  // Resolve the viewer's region, then check the prediction_pool rule
  // for it. Restricted regions fall back to spectator mode — viewer
  // picks an outcome (badge / social presence) but doesn't escrow
  // tokens, and isn't included in the parimutuel split.
  const regionResolution = resolveRegionFromRequest({ request, user: viewer });
  const complianceDecision = await checkCompliance({
    region: regionResolution.region,
    complianceClass: "prediction_pool",
  });

  if (complianceDecision.behavior === "unavailable") {
    return NextResponse.json(
      {
        error: "region_unavailable",
        message: "This feature isn't available in your region.",
      },
      { status: 451 },
    );
  }

  if (complianceDecision.behavior === "spectator") {
    const spectatorResult = await placeSpectatorPick({
      marketId,
      optionKey,
      identityId: callerIdentityId,
    });
    if (!spectatorResult.ok) {
      const statusByReason: Record<string, number> = {
        market_not_found: 404,
        market_not_open: 409,
        outcome_not_found: 400,
        already_picked: 409,
      };
      return NextResponse.json(
        { error: spectatorResult.reason, mode: "spectator" },
        { status: statusByReason[spectatorResult.reason] ?? 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      mode: "spectator",
      prediction: spectatorResult.prediction,
      region: regionResolution.region,
    });
  }

  // ---- 7. Full participation — real stake ------------------------------
  const balanceBefore = await getBalance(callerIdentityId);
  const amount =
    typeof amountRaw === "number"
      ? Number.isInteger(amountRaw) && amountRaw > 0
        ? amountRaw
        : null
      : parseAmount(String(amountRaw), balanceBefore);
  if (amount === null) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }

  const result = await placeBet({
    marketId,
    optionKey,
    identityId: callerIdentityId,
    amount,
  });
  if (!result.ok) {
    const statusByReason: Record<string, number> = {
      market_not_found: 404,
      market_not_open: 409,
      outcome_not_found: 400,
      insufficient_balance: 402,
      invalid_amount: 400,
    };
    return NextResponse.json(
      { error: result.reason, balance: result.balance ?? balanceBefore },
      { status: statusByReason[result.reason] ?? 400 },
    );
  }

  // Pool refresh — give the client the post-bet state so its UI can
  // render without a follow-up GET. Realtime will catch up other
  // viewers via the standard market channel.
  const pools = await getMarketPools(marketId);

  return NextResponse.json({
    ok: true,
    mode: "full",
    balance: result.balance,
    bet: {
      id: result.bet.id,
      marketId: result.bet.market_id,
      outcomeId: result.bet.outcome_id,
      amount: Number(result.bet.amount),
    },
    pools,
  });
}
