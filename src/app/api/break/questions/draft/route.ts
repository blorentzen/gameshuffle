/**
 * POST /api/break/questions/draft { questionnaire } → { ok, added, remaining }
 *
 * Know the Channel: AI drafts up to 15 questions from the streamer's
 * questionnaire, using only what they wrote, and saves them as drafts to keep
 * or toss on the Break mode screen. GS Pro, counted against the 30-day AI
 * allowance (the signed-in account's).
 */

import { NextResponse } from "next/server";
import { aiAccess } from "@/lib/ai/access";
import { recordAiUse } from "@/lib/ai/usage";
import { withAiTokens } from "@/lib/ai/tokens";
import { createServiceClient } from "@/lib/supabase/admin";
import { streamOwnerFor } from "@/lib/mods/acting";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import { addQuestions, ChannelQuestionsNotReady, draftChannelQuestions, listQuestions } from "@/lib/break/channelQuestions";

export const runtime = "nodejs";
export const maxDuration = 60;

const field = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(request: Request) {
  const access = await aiAccess("channel");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error, remaining: access.remaining }, { status: access.status });
  const { ownerUserId } = await streamOwnerFor(access.userId);
  const communityId = await resolveCommunityIdForOwner(ownerUserId).catch(() => null);
  if (!communityId) return NextResponse.json({ ok: false, error: "no_community" }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { questionnaire?: Record<string, unknown> };
  const q = body.questionnaire ?? {};
  const questionnaire = { games: field(q.games, 300), main: field(q.main, 200), facts: field(q.facts, 1500), jokes: field(q.jokes, 800), community: field(q.community, 600) };
  if (Object.values(questionnaire).join("").length < 20) return NextResponse.json({ ok: false, error: "too_little" }, { status: 400 });

  let existing: string[] = [];
  try {
    existing = (await listQuestions(communityId)).map((x) => x.prompt).slice(0, 60);
  } catch (err) {
    if (err instanceof ChannelQuestionsNotReady) return NextResponse.json({ ok: false, error: "not_ready" }, { status: 503 });
    throw err;
  }
  const { data: tc } = await createServiceClient().from("twitch_connections").select("twitch_display_name").eq("user_id", ownerUserId).maybeSingle();
  const { data: u } = await createServiceClient().from("users").select("display_name, username").eq("id", ownerUserId).maybeSingle();
  const streamer = (tc as { twitch_display_name?: string | null } | null)?.twitch_display_name
    || (u as { display_name?: string | null; username?: string | null } | null)?.display_name
    || (u as { username?: string | null } | null)?.username || "the streamer";

  const { value: res, tokens } = await withAiTokens(() => draftChannelQuestions(streamer, questionnaire, existing));
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.error === "rate_limited" ? 429 : 502 });
  await recordAiUse(access.userId, "channel", tokens);
  const saved = await addQuestions(communityId, access.userId, "ai", res.data);
  return NextResponse.json({ ok: true, added: saved.added, remaining: access.remaining === null ? null : access.remaining - 1 });
}
