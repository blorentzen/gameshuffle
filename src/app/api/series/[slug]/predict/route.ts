/**
 * POST /api/series/[slug]/predict { predictionId, option, amount, from? } → puts the signed-in viewer's
 * tokens on a prediction. `from` is the streamer's handle when the pick came from their live page (it goes
 * to that channel's leaderboard). Tokens only where prediction pools are allowed.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { forgetView, loadSeries } from "@/lib/series/store";
import { seriesViewer } from "@/lib/series/viewer";
import { placeStake, STAKE_ERRORS } from "@/lib/series/predictions";
import { ensureAccountWallet } from "@/lib/economy/accountWallet";
import { checkCompliance } from "@/lib/economy/compliance/gate";
import { resolveRegionFromRequest } from "@/lib/economy/compliance/region";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await seriesViewer();
  if (!viewer.userId || !viewer.user) return NextResponse.json({ error: "Sign in to predict." }, { status: 401 });
  const limited = await rateLimit(`series-predict:${viewer.userId}`, { max: 20, windowMs: 60_000 }).catch(() => null);
  if (limited && !limited.ok) return NextResponse.json({ error: "That's a lot of picks at once. Try again in a minute." }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { predictionId?: unknown; option?: unknown; amount?: unknown; from?: unknown } | null;
  const predictionId = typeof body?.predictionId === "string" ? body.predictionId : "";
  const option = typeof body?.option === "string" ? body.option : "";
  const amount = Number(body?.amount);
  if (!predictionId || !option) return NextResponse.json({ error: STAKE_ERRORS.bad_option }, { status: 400 });

  const l = await loadSeries({ slug });
  if (!l || l.series.status !== "live") return NextResponse.json({ error: STAKE_ERRORS.not_ready }, { status: 409 });

  const region = resolveRegionFromRequest({ request: req, user: viewer.user });
  const decision = await checkCompliance({ region: region.region, complianceClass: "prediction_pool" });
  const devUnknown = process.env.NODE_ENV === "development" && decision.reason === "unknown_region_default";
  if (decision.behavior !== "full" && !devUnknown) {
    return NextResponse.json({ error: "Predictions with tokens aren't open where you are." }, { status: 403 });
  }

  let communityId: string | null = null;
  if (typeof body?.from === "string" && /^[a-z0-9_.-]{2,40}$/i.test(body.from)) {
    const { data } = await createServiceClient().from("users").select("id").eq("username", body.from.toLowerCase()).maybeSingle();
    const owner = (data as { id: string } | null)?.id;
    if (owner && l.players.some((p) => p.user_id === owner)) communityId = await resolveCommunityIdForOwner(owner).catch(() => null);
  }
  const wallet = await ensureAccountWallet(viewer.userId, viewer.name).catch(() => null);
  if (!wallet) return NextResponse.json({ error: STAKE_ERRORS.not_ready }, { status: 500 });
  const r = await placeStake({ predictionId, identityId: wallet.identityId, option, amount, communityId });
  if (!r.ok) return NextResponse.json({ error: STAKE_ERRORS[r.error], code: r.error, balance: r.balance ?? null }, { status: 409 });
  forgetView(l.series.slug);
  return NextResponse.json({ ok: true, balance: r.balance });
}
