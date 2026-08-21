/**
 * GET / POST /api/polls
 *
 * Streamer-facing poll management for the Polls tab.
 *   GET  → { isPro, polls } for the owner's community.
 *   POST → create a poll (Pro-gated). Body: { question, options[], open?,
 *          allowChange?, anonAllowed? }.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import { createPoll, listPollsForCommunity, isPollError } from "@/lib/polls/store";

export const runtime = "nodejs";

type OwnerCtx =
  | { error: string; status: number }
  | { userId: string; isPro: boolean; communityId: string | null };

export async function ownerContext(): Promise<OwnerCtx> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthenticated", status: 401 };

  const { data: prof } = await createServiceClient()
    .from("users")
    .select("subscription_tier, role")
    .eq("id", user.id)
    .maybeSingle();
  const p = prof as { subscription_tier: string | null; role: string | null } | null;
  const isPro =
    effectiveTier({ tier: normalizeTier(p?.subscription_tier ?? null), role: p?.role ?? null }) ===
    "pro";
  const communityId = await resolveCommunityIdForOwner(user.id);
  return { userId: user.id, isPro, communityId };
}

export async function GET() {
  const ctx = await ownerContext();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const polls = ctx.communityId ? await listPollsForCommunity(ctx.communityId) : [];
  return NextResponse.json({ ok: true, isPro: ctx.isPro, hasCommunity: !!ctx.communityId, polls });
}

export async function POST(request: Request) {
  const ctx = await ownerContext();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  if (!ctx.isPro) return NextResponse.json({ ok: false, error: "pro_required" }, { status: 403 });
  if (!ctx.communityId) return NextResponse.json({ ok: false, error: "no_community" }, { status: 400 });

  let body: {
    question?: string;
    options?: unknown[];
    open?: boolean;
    allowChange?: boolean;
    anonAllowed?: boolean;
    closeInSeconds?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  // Auto-close only makes sense relative to open time, so it applies to polls
  // opened now (a draft's timer would be stale by the time it opens).
  const closeInSeconds = typeof body.closeInSeconds === "number" ? body.closeInSeconds : 0;
  const closesAt =
    body.open && closeInSeconds > 0
      ? new Date(Date.now() + closeInSeconds * 1000).toISOString()
      : null;

  const result = await createPoll({
    communityId: ctx.communityId,
    question: String(body.question ?? ""),
    options: Array.isArray(body.options) ? body.options.map((o) => String(o)) : [],
    allowChange: body.allowChange !== false,
    anonAllowed: body.anonAllowed !== false,
    open: !!body.open,
    closesAt,
    createdBy: ctx.userId,
  });
  if (isPollError(result)) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, poll: result });
}
