/**
 * GET /api/live/[streamer-slug]/market
 *
 * Returns the active market for the streamer's current session +
 * outcomes + pool sizes + spectator tally + the caller's pick (if
 * authenticated). Open + locked markets surface; settled and
 * cancelled markets return `market: null`.
 *
 * Polled by the /live page Markets tab (every ~5s). Public read; no
 * auth required, but if the caller IS authenticated via Twitch we
 * also resolve their own pick / bet for the optimistic-render path.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  findActiveMarket,
  getMarketPools,
  listOutcomes,
} from "@/lib/economy/markets/lifecycle";
import { getSpectatorTally } from "@/lib/economy/markets/spectator";
import { getIdentityByPlatform } from "@/lib/economy/identity";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ "streamer-slug": string }> },
) {
  const { "streamer-slug": slug } = await params;
  if (!slug) {
    return NextResponse.json({ error: "missing_slug" }, { status: 400 });
  }

  const admin = createServiceClient();

  // Resolve streamer → community → active session.
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
    return NextResponse.json({ market: null, reason: "streamer_not_found" });
  }

  const { data: sessionRow } = await admin
    .from("gs_sessions")
    .select("id, owner_user_id, status, active_game, configured_games, config")
    .eq("owner_user_id", (streamer as { id: string }).id)
    .in("status", ["active", "ending"])
    .order("activated_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!sessionRow) {
    return NextResponse.json({ market: null, reason: "no_active_session" });
  }

  // Game key canonicalization mirrors the chat / web bet path.
  const rawSlug =
    (sessionRow as { active_game?: string | null }).active_game ??
    ((sessionRow as { configured_games?: string[] | null }).configured_games?.[0] ?? null) ??
    (((sessionRow as { config?: { game?: string | null } | null }).config?.game) ?? null);
  const gameKey = canonicalizeGameKey(rawSlug);
  if (!gameKey) {
    return NextResponse.json({ market: null, reason: "game_not_supported" });
  }

  const market = await findActiveMarket({
    sessionId: (sessionRow as { id: string }).id,
    gameKey,
  });
  if (!market) {
    return NextResponse.json({ market: null, reason: "no_active_market" });
  }

  const [outcomes, pools, spectatorTally] = await Promise.all([
    listOutcomes(market.id),
    getMarketPools(market.id),
    getSpectatorTally(market.id),
  ]);

  // Caller's own pick / bet — best-effort, only when authenticated.
  const supabase = await createClient();
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  let viewerState: {
    identityId: string | null;
    betOutcomeId: string | null;
    betAmount: number | null;
    spectatorOutcomeId: string | null;
  } | null = null;
  if (viewer) {
    const viewerTwitch = (viewer.identities ?? []).find(
      (i) => i.provider === "twitch",
    );
    const viewerTwitchId =
      (viewerTwitch?.identity_data?.sub as string | undefined) ??
      (viewerTwitch?.identity_data?.provider_id as string | undefined) ??
      null;
    if (viewerTwitchId) {
      const identity = await getIdentityByPlatform("twitch", viewerTwitchId);
      if (identity) {
        const [{ data: betRow }, { data: predictionRow }] = await Promise.all([
          admin
            .from("gs_bets")
            .select("outcome_id, amount")
            .eq("market_id", market.id)
            .eq("identity_id", identity.id)
            .maybeSingle(),
          admin
            .from("gs_market_predictions")
            .select("outcome_id")
            .eq("market_id", market.id)
            .eq("identity_id", identity.id)
            .maybeSingle(),
        ]);
        viewerState = {
          identityId: identity.id,
          betOutcomeId:
            (betRow as { outcome_id?: string } | null)?.outcome_id ?? null,
          betAmount:
            (betRow as { amount?: number } | null)?.amount !== undefined
              ? Number((betRow as { amount: number }).amount)
              : null,
          spectatorOutcomeId:
            (predictionRow as { outcome_id?: string } | null)?.outcome_id ??
            null,
        };
      }
    }
  }

  return NextResponse.json({
    market: {
      id: market.id,
      status: market.status,
      gameKey: market.game_key,
      variableType: market.variable_type,
      question: market.question,
      subject: market.subject,
      openedAt: market.opened_at,
      lockAt: market.lock_at,
      lockedAt: market.locked_at,
    },
    outcomes: outcomes.map((o) => ({
      id: o.id,
      optionKey: o.option_key,
      label: o.label,
      isWinner: o.is_winner,
    })),
    pools,
    spectatorTally,
    viewerState,
  });
}

// Inlined to avoid pulling chat-handler internals; mirrors
// canonicalizeGameKey in src/lib/twitch/commands/economy.ts.
function canonicalizeGameKey(slug: string | null): string | null {
  if (slug === "mk8dx" || slug === "mario-kart-8-deluxe") {
    return "mario-kart-8-deluxe";
  }
  if (slug === "mkworld" || slug === "mario-kart-world") {
    return "mario-kart-world";
  }
  return null;
}

