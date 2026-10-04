/**
 * GET /api/cron/chat-brain-discord — daily, 16:00 UTC.
 *
 * Posts one open Chat Brain question, with an Answer button, to every
 * streamer's Discord that routes the "Chat Brain" category. Opt-in: no route,
 * no post. The question is the open one furthest from its answer target,
 * skipping anything posted in the last 7 days. The day is claimed first (a
 * brain_discord_posts row) so a retried run can't post twice.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { postComponentsToCategory } from "@/lib/adapters/discord";
import { ChatBrainNotReady, promptNeedingAnswers } from "@/lib/chatbrain/store";
import { brainQuestionMessage } from "@/lib/discord/commands/chatbrain";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/chat-brain-discord] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  try {
    const admin = createServiceClient();
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const { data: recent, error: recentErr } = await admin.from("brain_discord_posts").select("prompt_id").gte("posted_on", weekAgo);
    if (recentErr?.code === "42P01" || recentErr?.code === "PGRST205") return NextResponse.json({ ok: true, posted: 0, note: "not_ready" });

    const prompt = await promptNeedingAnswers({ exclude: ((recent ?? []) as { prompt_id: string | null }[]).flatMap((r) => (r.prompt_id ? [r.prompt_id] : [])) });
    if (!prompt) return NextResponse.json({ ok: true, posted: 0, note: "no_open_questions" });

    const { error: claimErr } = await admin.from("brain_discord_posts").insert({ posted_on: today, prompt_id: prompt.id });
    if (claimErr) return NextResponse.json({ ok: true, posted: 0, note: claimErr.code === "23505" ? "already_posted" : "claim_failed" });

    const message = brainQuestionMessage(prompt, { title: "Chat Brain: today's question" });
    const { data: routes } = await admin.from("discord_channel_routes").select("user_id").eq("category", "chatbrain").limit(5000);
    let posted = 0;
    for (const r of (routes ?? []) as { user_id: string }[]) {
      const res = await postComponentsToCategory({
        ownerUserId: r.user_id, category: "chatbrain", requireRoute: true,
        embed: message.embeds[0], components: message.components,
      }).catch((err) => ({ ok: false as const, reason: String(err) }));
      if (res.ok) posted += 1;
      else console.warn("[cron/chat-brain-discord] post skipped:", r.user_id, res.reason);
    }
    await admin.from("brain_discord_posts").update({ servers: posted }).eq("posted_on", today);
    return NextResponse.json({ ok: true, posted, promptId: prompt.id });
  } catch (err) {
    if (err instanceof ChatBrainNotReady) return NextResponse.json({ ok: true, posted: 0, note: "not_ready" });
    console.error("[cron/chat-brain-discord] failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
