/**
 * GET /api/cron/weekly — Monday, just after 00:00 UTC.
 *
 * Reveals last week's Weekly Challenge (scores + ranks), makes sure this
 * week's exists, then posts it to every streamer's Discord that routes the
 * "Weekly Challenge" category. Opt-in: no route, no post (no fallback to the
 * default channel). The week's post is claimed first (discord_posted_at) so a
 * retried run can't post twice.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { postAnnouncementToCategory } from "@/lib/adapters/discord";
import { addWeeks, weekNumber, weekOf } from "@/lib/originals/weekly";
import { WeeklyNotReady, agendaCard, ensureWeek, leaderboard, revealDue } from "@/lib/weekly/store";

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
    const agenda = agendaCard(week.agenda_card_id);
    const body = [
      `**Tier War:** rank ${week.title.toLowerCase()} from S to D: ${week.items.map((i) => i.label).join(", ")}. The crowd's ranking is revealed next Monday.`,
      agenda ? `**At game nights:** ${agenda.title}. ${agenda.text}` : null,
      winner ? `Last week's #1: ${winner.name} with ${winner.total} points.` : null,
    ].filter(Boolean).join("\n\n");

    const { data: routes } = await admin.from("discord_channel_routes").select("user_id").eq("category", "weekly").limit(5000);
    let posted = 0;
    for (const r of (routes ?? []) as { user_id: string }[]) {
      const res = await postAnnouncementToCategory({
        ownerUserId: r.user_id, category: "weekly", requireRoute: true,
        title: `Weekly Challenge #${weekNumber(thisWeek)}`, body, url: "https://www.gameshuffle.co/weekly",
      }).catch((err) => ({ ok: false as const, reason: String(err) }));
      if (res.ok) posted += 1;
      else console.warn("[cron/weekly] post skipped:", r.user_id, res.reason);
    }
    return NextResponse.json({ ok: true, posted });
  } catch (err) {
    if (err instanceof WeeklyNotReady) return NextResponse.json({ ok: true, posted: 0, note: "not_ready" });
    console.error("[cron/weekly] failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
