/**
 * GET /api/cron/hero-rosters (monthly, 1st at 15:00 UTC)
 *
 * Compares the Overwatch and Marvel Rivals rosters with the publishers' hero
 * pages (src/lib/heroes/rosterCheck.ts). When something's new, gone or
 * unreadable, emails support@ and sends every staff/admin account a
 * notification pointing at Platform ▸ Health. Nothing changes on its own: a
 * person updates src/data/heroes/*.ts (and the art) after checking.
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkHeroRosters, needsAttention, rosterSummary } from "@/lib/heroes/rosterCheck";
import { createNotification } from "@/lib/social/notifications";
import { sendTransactionalEmail } from "@/lib/email/mailersend";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/hero-rosters] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const checks = await checkHeroRosters();
  const flagged = checks.filter(needsAttention);
  if (!flagged.length) return NextResponse.json({ ok: true, flagged: 0, checks });

  const summary = rosterSummary(checks);
  const title = `Hero roster check: ${flagged.map((c) => c.label).join(" and ")} ${flagged.length === 1 ? "needs" : "need"} a look`;
  await sendTransactionalEmail({
    to: "support@gameshuffle.co",
    subject: `[Rosters] ${title}`,
    text: `${summary}\n\nUpdate src/data/heroes/*.ts (name, role, released) and add the hero's art, then bump checkedOn.\nPlatform ▸ Health runs this check again on demand.`,
    fromName: "GameShuffle",
  }).catch((e) => console.error("[cron/hero-rosters] email failed:", e instanceof Error ? e.message : e));

  const { data: staff } = await createServiceClient().from("users").select("id").in("role", ["staff", "admin"]);
  await Promise.all(((staff ?? []) as { id: string }[]).map((u) => createNotification({
    userId: u.id, type: "system", title, message: summary.slice(0, 500), link: "/account/platform?tab=platform-health",
  }).catch(() => undefined)));

  return NextResponse.json({ ok: true, flagged: flagged.length, checks });
}
