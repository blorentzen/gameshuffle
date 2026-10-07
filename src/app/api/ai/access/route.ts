/**
 * GET /api/ai/access?feature=setup → AiAccessInfo
 *
 * What the page needs to explain an AI feature before anyone types: signed in
 * or not, the plan, generations left, and the current limits. Display only;
 * every /api/ai route checks again (aiAccess).
 */

import { NextResponse } from "next/server";
import { aiPlanFor, aiRemainingFor } from "@/lib/ai/access";
import { aiConfigured } from "@/lib/ai/claude";
import { AI_FEATURES, isAiFeature, type AiAccessInfo } from "@/lib/ai/features";
import { aiLimits } from "@/lib/ai/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const feature = new URL(request.url).searchParams.get("feature");
  if (!isAiFeature(feature)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const [who, limits] = await Promise.all([aiPlanFor(), aiLimits()]);
  const remaining = who ? await aiRemainingFor(who.userId, who.plan, AI_FEATURES[feature].free, limits) : null;
  const info: AiAccessInfo = { feature, plan: who?.plan ?? null, remaining, limits, configured: aiConfigured() };
  return NextResponse.json(info, { headers: { "Cache-Control": "no-store" } });
}
