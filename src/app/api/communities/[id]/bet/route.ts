/**
 * POST /api/communities/[id]/bet — participate in a community's open market from
 * the account wallet.
 *
 * Body: { marketId, optionKey, amount }
 *
 * Mirrors the /live bet flow (compliance gate → spectator pick or staked bet)
 * but resolves the caller's ACCOUNT wallet identity instead of their Twitch
 * viewer identity. The account identity is durable (keyed to the GS account), so
 * unlike an email-only Twitch viewer there's no "lose the stake on merge" risk.
 *
 * Requires community membership. `[id]` is the gs_communities id.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getCommunityById, isMember } from "@/lib/communities/membership";
import { ensureAccountWallet } from "@/lib/economy/accountWallet";
import { getBalance, parseAmount } from "@/lib/economy/tokens";
import { getMarketPools, placeBet } from "@/lib/economy/markets/lifecycle";
import { placeSpectatorPick } from "@/lib/economy/markets/spectator";
import { checkCompliance } from "@/lib/economy/compliance/gate";
import { resolveRegionFromRequest } from "@/lib/economy/compliance/region";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: communityId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { marketId?: string; optionKey?: string; amount?: string | number };
  const { marketId, optionKey, amount: amountRaw } = body;
  if (!marketId || typeof marketId !== "string" || !optionKey || typeof optionKey !== "string") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const community = await getCommunityById(communityId);
  if (!community) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await isMember(user.id, communityId))) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }

  // Market must belong to THIS community and be open.
  const admin = createServiceClient();
  const { data: marketRow } = await admin
    .from("gs_markets")
    .select("id, community_id, status")
    .eq("id", marketId)
    .maybeSingle();
  const market = marketRow as { community_id: string; status: string } | null;
  if (!market) return NextResponse.json({ error: "market_not_found" }, { status: 404 });
  if (market.community_id !== community.id) return NextResponse.json({ error: "market_community_mismatch" }, { status: 409 });
  if (market.status !== "open") return NextResponse.json({ error: "market_not_open" }, { status: 409 });

  // Resolve the account wallet identity (durable; creates + grants on first use).
  const wallet = await ensureAccountWallet(user.id).catch(() => null);
  if (!wallet) return NextResponse.json({ error: "wallet_unavailable" }, { status: 503 });
  const identityId = wallet.identityId;

  // Compliance gate — restricted regions fall back to a free spectator pick.
  const region = resolveRegionFromRequest({ request, user });
  const decision = await checkCompliance({ region: region.region, complianceClass: "prediction_pool" });
  if (decision.behavior === "unavailable") {
    return NextResponse.json({ error: "region_unavailable", message: "This feature isn't available in your region." }, { status: 451 });
  }
  if (decision.behavior === "spectator" || amountRaw === undefined || amountRaw === null || amountRaw === "") {
    const pick = await placeSpectatorPick({ marketId, optionKey, identityId });
    if (!pick.ok) {
      const status: Record<string, number> = { market_not_found: 404, market_not_open: 409, outcome_not_found: 400, already_picked: 409 };
      return NextResponse.json({ error: pick.reason, mode: "spectator" }, { status: status[pick.reason] ?? 400 });
    }
    return NextResponse.json({ ok: true, mode: "spectator", prediction: pick.prediction });
  }

  // Full participation — real stake from the account wallet.
  const balanceBefore = await getBalance(identityId);
  const amount = typeof amountRaw === "number"
    ? (Number.isInteger(amountRaw) && amountRaw > 0 ? amountRaw : null)
    : parseAmount(String(amountRaw), balanceBefore);
  if (amount === null) return NextResponse.json({ error: "invalid_amount" }, { status: 400 });

  const result = await placeBet({ marketId, optionKey, identityId, amount });
  if (!result.ok) {
    const status: Record<string, number> = { market_not_found: 404, market_not_open: 409, outcome_not_found: 400, insufficient_balance: 402, invalid_amount: 400 };
    return NextResponse.json({ error: result.reason, balance: result.balance ?? balanceBefore }, { status: status[result.reason] ?? 400 });
  }

  return NextResponse.json({
    ok: true,
    mode: "full",
    balance: result.balance,
    bet: { id: result.bet.id, marketId: result.bet.market_id, outcomeId: result.bet.outcome_id, amount: Number(result.bet.amount) },
    pools: await getMarketPools(marketId),
  });
}
