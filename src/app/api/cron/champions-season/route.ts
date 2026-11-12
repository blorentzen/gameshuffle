/**
 * GET /api/cron/champions-season (monthly, the 1st at 15:30 UTC: 8:30am PDT / 7:30am PST)
 *
 * A plain reminder to check Pokémon Champions' season list (game space picks 2026-11-11, pick 11): which regulation
 * GameShuffle has, when it ends and when the list was last checked, with the official pages to look at. Emails
 * support@ and sends every staff/admin account a notification. Nothing is read from anyone's site and nothing
 * changes on its own: a person updates src/data/pokemon/champions.json and champions-season.ts (wording in
 * `seasonReminder`, src/lib/pokemon/champions.ts). Modeled on /api/cron/hero-rosters.
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/social/notifications";
import { sendTransactionalEmail } from "@/lib/email/mailersend";
import { seasonReminder, TEAM_BUILDER_PATH } from "@/lib/pokemon/champions";
import { gsDay } from "@/lib/time/gsClock";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/champions-season] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const { title, text } = seasonReminder(gsDay());
  // ?dry=1 shows what would go out without sending it.
  if (request.nextUrl.searchParams.get("dry") === "1") return NextResponse.json({ ok: true, dry: true, title, text });

  await sendTransactionalEmail({
    to: "support@gameshuffle.co",
    subject: `[Season list] ${title}`,
    text,
    fromName: "GameShuffle",
  }).catch((e) => console.error("[cron/champions-season] email failed:", e instanceof Error ? e.message : e));

  const { data: staff } = await createServiceClient().from("users").select("id").in("role", ["staff", "admin"]);
  await Promise.all(((staff ?? []) as { id: string }[]).map((u) => createNotification({
    userId: u.id, type: "system", title, message: text.split("\n").slice(0, 2).join(" ").slice(0, 500), link: TEAM_BUILDER_PATH,
  }).catch(() => undefined)));

  return NextResponse.json({ ok: true, title });
}
