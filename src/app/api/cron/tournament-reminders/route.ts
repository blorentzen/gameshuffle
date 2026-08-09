/**
 * GET /api/cron/tournament-reminders
 *
 * Every 15 minutes: remind signed-up participants that a tournament is coming
 * up. Two thresholds — a "day" reminder (start is 1–24h out) and an "hour"
 * reminder (start is <1h out) — each delivered once via in-app notification
 * (account participants) + email (account + guest participants).
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 * Idempotence: every send claims a row in `tournament_reminders_sent`
 * (unique on tournament+participant+threshold) BEFORE dispatching, so a
 * late/double run never double-sends.
 *
 * Schedule: see `vercel.json`.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/social/notifications";
import { sendTournamentReminderEmail } from "@/lib/email/tournament";
import { formatEventTime } from "@/lib/time/format";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;
// Statuses that should never receive reminders (draft/finished/cancelled).
const BLOCKED_STATUS = new Set(["draft", "cancelled", "canceled", "completed", "complete", "ended"]);

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/tournament-reminders] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const admin = createServiceClient();
  const now = Date.now();
  const bands = [
    { key: "day" as const, lo: now + 1 * HOUR, hi: now + 24 * HOUR },
    { key: "hour" as const, lo: now, hi: now + 1 * HOUR },
  ];

  // Every tournament starting within the next 24h that isn't draft/done/cancelled.
  const { data: tournaments, error } = await admin
    .from("tournaments")
    .select("id, title, date_time, status")
    .gt("date_time", new Date(now).toISOString())
    .lte("date_time", new Date(now + 24 * HOUR).toISOString());
  if (error) {
    console.error("[cron/tournament-reminders] tournament query failed:", error);
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }
  const active = (tournaments ?? []).filter(
    (t) => t.date_time && !BLOCKED_STATUS.has((t.status ?? "").toLowerCase()),
  );
  if (!active.length) return NextResponse.json({ ok: true, notifs: 0, emails: 0 });

  const ids = active.map((t) => t.id);

  const { data: parts } = await admin
    .from("tournament_participants")
    .select("id, tournament_id, user_id, display_name, status")
    .in("tournament_id", ids)
    .in("status", ["registered", "confirmed", "checked_in"]);
  const participants = parts ?? [];

  // Account participants → in-app notification + email (email from user_directory,
  // timezone from users). Guest participants → email only (from guest claims).
  const userIds = [...new Set(participants.filter((p) => p.user_id).map((p) => p.user_id as string))];
  const emailById = new Map<string, string>();
  const tzById = new Map<string, string | null>();
  if (userIds.length) {
    const [{ data: dir }, { data: us }] = await Promise.all([
      admin.from("user_directory").select("id, email").in("id", userIds),
      admin.from("users").select("id, timezone").in("id", userIds),
    ]);
    for (const r of dir ?? []) if (r.email) emailById.set(r.id, r.email as string);
    for (const r of us ?? []) tzById.set(r.id, (r.timezone as string | null) ?? null);
  }
  const guestPartIds = participants.filter((p) => !p.user_id).map((p) => p.id);
  const guestEmailByPart = new Map<string, string>();
  if (guestPartIds.length) {
    const { data: claims } = await admin
      .from("tournament_guest_claims")
      .select("participant_id, email")
      .in("participant_id", guestPartIds);
    for (const c of claims ?? []) if (c.email) guestEmailByPart.set(c.participant_id, c.email as string);
  }

  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://gameshuffle.co";
  let notifs = 0;
  let emails = 0;

  for (const t of active) {
    const start = new Date(t.date_time as string).getTime();
    const band = bands.find((b) => start > b.lo && start <= b.hi);
    if (!band) continue;
    const url = `${base}/tournament/${t.id}`;

    for (const p of participants.filter((pp) => pp.tournament_id === t.id)) {
      // Claim the reminder first — the unique constraint makes this the dedupe
      // gate; if it fails, someone already sent this one (or it's a dupe run).
      const { error: claimErr } = await admin
        .from("tournament_reminders_sent")
        .insert({ tournament_id: t.id, participant_id: p.id, threshold: band.key });
      if (claimErr) continue;

      if (p.user_id) {
        const tz = tzById.get(p.user_id) ?? null;
        await createNotification({
          userId: p.user_id,
          type: "tournament_reminder",
          title: "Tournament coming up",
          message: `${t.title} starts ${formatEventTime(t.date_time as string, tz)}`,
          link: `/tournament/${t.id}`,
          data: { tournamentId: t.id, threshold: band.key },
        });
        notifs++;
        const email = emailById.get(p.user_id);
        if (email) {
          await sendTournamentReminderEmail({
            to: email, toName: p.display_name ?? undefined,
            tournamentTitle: t.title, startIso: t.date_time as string,
            tournamentUrl: url, viewerTz: tz,
          });
          emails++;
        }
      } else {
        const email = guestEmailByPart.get(p.id);
        if (email) {
          await sendTournamentReminderEmail({
            to: email, toName: p.display_name ?? undefined,
            tournamentTitle: t.title, startIso: t.date_time as string,
            tournamentUrl: url,
          });
          emails++;
        }
      }
    }
  }

  return NextResponse.json({ ok: true, notifs, emails });
}
