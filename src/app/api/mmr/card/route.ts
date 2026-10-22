/**
 * The signed-in player's MMR card.
 *   GET   → { card, pro }   (card is null until the first save)
 *   PATCH { loungeName?, looks?, activeLook?, followTwitch?, showOnProfile?, goal?, goalKeep?, weeklyReport? } → { card, freeSaved, lineRefused }
 *         lineRefused: a look's own line (GS Pro) had blocked words and was saved without it.
 *         goal: { mmr, game } sets tonight's goal (GS Pro, 403 pro_required otherwise), null clears it;
 *         goalKeep keeps it past tonight; weeklyReport turns the Monday lounge report on or off.
 *         503 not_ready until supabase/lounge-night-m1.sql has run.
 *   POST  { action: "reset" } → a new OBS link (the old one stops working)
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isProUser } from "@/lib/subscription-server";
import { cardFor, cardView, resetToken, saveCard } from "@/lib/mmr/store";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

async function authUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET() {
  const userId = await authUserId();
  if (!userId) return NextResponse.json({ error: "signin" }, { status: 401 });
  const [card, pro] = await Promise.all([cardFor(userId), isProUser(userId)]);
  return NextResponse.json({ card: card ? cardView(card) : null, pro });
}

export async function PATCH(req: NextRequest) {
  const userId = await authUserId();
  if (!userId) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!(await rateLimit(`mmr-save:${userId}`, { max: 60, windowMs: 60_000 })).ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const res = await saveCard(userId, {
    loungeName: body.loungeName === undefined ? undefined : typeof body.loungeName === "string" ? body.loungeName : null,
    looks: Array.isArray(body.looks) ? body.looks : undefined,
    activeLook: body.activeLook === undefined ? undefined : (body.activeLook as string | null),
    followTwitch: typeof body.followTwitch === "boolean" ? body.followTwitch : undefined,
    showOnProfile: typeof body.showOnProfile === "boolean" ? body.showOnProfile : undefined,
    goal: body.goal === undefined ? undefined : body.goal === null ? null : typeof body.goal === "object" ? (body.goal as { mmr: unknown; game?: unknown }) : { mmr: body.goal },
    goalKeep: typeof body.goalKeep === "boolean" ? body.goalKeep : undefined,
    weeklyReport: typeof body.weeklyReport === "boolean" ? body.weeklyReport : undefined,
  });
  if (!res.ok) {
    const status = res.error === "bad_name" || res.error === "bad_goal" ? 400 : res.error === "pro_required" ? 403 : res.error === "not_ready" ? 503 : 500;
    return NextResponse.json({ error: res.error }, { status });
  }
  return NextResponse.json({ card: cardView(res.card), freeSaved: res.freeSaved, lineRefused: res.lineRefused });
}

export async function POST(req: NextRequest) {
  const userId = await authUserId();
  if (!userId) return NextResponse.json({ error: "signin" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  if (body?.action !== "reset") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const card = await resetToken(userId);
  if (!card) return NextResponse.json({ error: "no_card" }, { status: 404 });
  return NextResponse.json({ card: cardView(card) });
}
