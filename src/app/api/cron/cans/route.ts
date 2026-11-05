/**
 * GET /api/cron/cans: the 15-minute reminder for a locked lineup (cans picks 2026-11-04, 15A). Every 5 minutes
 * (vercel.json), so it lands 15 to 20 minutes before; each check is claimed once (reminded_at).
 */

import { NextResponse } from "next/server";
import { cansReady, claimReminder, remindersDue } from "@/lib/cans/store";
import { REMIND_MINUTES, discordTime } from "@/lib/cans/rules";
import { compRest } from "@/lib/discord/compRest";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/cans] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }
  if (!(await cansReady())) return NextResponse.json({ ok: true, sent: 0, note: "not_ready" });
  let sent = 0;
  for (const c of await remindersDue(REMIND_MINUTES + 5)) {
    if (!c.lineup || !(await claimReminder(c.id))) continue;
    const ids = [...c.lineup.players, ...c.lineup.subs];
    const res = await compRest("POST", `/channels/${c.channelId}/messages`, {
      content: `**War ${discordTime(c.startsAt, "R")}${c.vs ? ` vs ${c.vs}` : ""}** (${discordTime(c.startsAt, "t")})\n${c.lineup.players.map((id) => `<@${id}>`).join(" ")}${c.lineup.subs.length ? ` · sub ${c.lineup.subs.map((id) => `<@${id}>`).join(" ")}` : ""}`,
      allowed_mentions: { users: ids },
      ...(c.messageId ? { message_reference: { message_id: c.messageId, fail_if_not_exists: false } } : {}),
    });
    if (res.ok) sent++;
    else console.error("[cron/cans] reminder failed:", c.id, res.status, res.error);
  }
  return NextResponse.json({ ok: true, sent });
}
