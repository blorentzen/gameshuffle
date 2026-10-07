/**
 * GET /api/cron/weekly — Monday, just after midnight Pacific. Vercel cron runs
 * in UTC, so it's scheduled at 07:10 and 08:10 UTC (one of them is 00:10
 * Pacific, PDT or PST); the other run finds nothing to do (reveals and posts
 * are claimed).
 *
 * Reveals last week's Weekly Challenge (scores + ranks), makes sure this
 * week's exists, then posts its card (with Play buttons, see
 * src/lib/discord/commands/weekly.ts) to every streamer's Discord that routes the
 * "Weekly Challenge" category. Opt-in: no route, no post (no fallback to the
 * default channel). The week's post is claimed first (discord_posted_at) so a
 * retried run can't post twice.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { postComponentsToCategory } from "@/lib/adapters/discord";
import { addWeeks, weekOf } from "@/lib/originals/weekly";
import { WeeklyNotReady, ensureWeek, leaderboard, revealDue } from "@/lib/weekly/store";
import { weeklyCardMessage } from "@/lib/discord/commands/weekly";
import { recordPromptPost, weekTopic } from "@/lib/discord/promptPosts";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/weekly] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  try {
    await revealDue();
    const thisWeek = weekOf();
    const week = await ensureWeek(thisWeek);
    const admin = createServiceClient();

    const { data: claim } = await admin.from("weekly_challenges").update({ discord_posted_at: new Date().toISOString() })
      .eq("week_start", thisWeek).is("discord_posted_at", null).select("week_start").maybeSingle();
    if (!claim) return NextResponse.json({ ok: true, posted: 0, note: "already_posted" });

    const [winner] = await leaderboard(addWeeks(thisWeek, -1), 1);
    // The same card /gs-weekly shows, with Play and Last week buttons.
    const footerLine = winner ? `Last week's #1: ${winner.name} with ${winner.total} points.` : null;
    const message = weeklyCardMessage(week, { footerLine });
    const topic = await weekTopic(week);

    const { data: routes } = await admin.from("discord_channel_routes").select("user_id").eq("category", "weekly").limit(5000);
    let posted = 0;
    for (const r of (routes ?? []) as { user_id: string }[]) {
      const res = await postComponentsToCategory({
        ownerUserId: r.user_id, category: "weekly", requireRoute: true,
        embed: message.embeds[0], components: message.components,
      }).catch((err) => ({ ok: false as const, reason: String(err) }));
      if (res.ok) {
        posted += 1;
        await recordPromptPost({ messageId: res.messageId, channelId: res.channelId, guildId: res.guildId, topic, kind: "weekly", ref: week.week_start, payload: { footerLine } });
      } else console.warn("[cron/weekly] post skipped:", r.user_id, res.reason);
    }
    return NextResponse.json({ ok: true, posted });
  } catch (err) {
    if (err instanceof WeeklyNotReady) return NextResponse.json({ ok: true, posted: 0, note: "not_ready" });
    console.error("[cron/weekly] failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
