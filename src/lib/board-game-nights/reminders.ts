import "server-only";
import { getBaseUrl } from "@/lib/env";

/**
 * Board-game-night RSVP reminders. Once per night, ~24h out, everyone who RSVP'd
 * "going" gets an in-app notification + an email. `reminder_sent_at` is claimed
 * atomically (conditional update on NULL) before dispatch, so overlapping cron
 * runs never double-send. Guarded so an unapplied `reminder_sent_at` column just
 * means no reminders fire. See `supabase/board-game-night-reminders.sql`.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/social/notifications";
import { sendNightReminderEmail } from "@/lib/email/board-game-nights";
import { formatEventTime } from "@/lib/time/format";
import { postAnnouncementToCategory } from "@/lib/adapters/discord";

const HOUR = 60 * 60 * 1000;

interface NightRow {
  id: string;
  host_id: string;
  title: string;
  place: string | null;
  starts_at: string | null;
  timezone: string | null;
}

export async function sendDueNightReminders(): Promise<{ nights: number; notifs: number; emails: number; discord: number }> {
  const admin = createServiceClient();
  const now = Date.now();
  const windowEnd = new Date(now + 26 * HOUR).toISOString();
  const base = getBaseUrl();

  // Scheduled nights starting within ~26h that haven't been reminded yet.
  const { data: nights, error } = await admin
    .from("board_game_nights")
    .select("id, host_id, title, place, starts_at, timezone")
    .eq("status", "scheduled")
    .is("reminder_sent_at", null)
    .gt("starts_at", new Date(now + HOUR).toISOString())
    .lte("starts_at", windowEnd);
  if (error) return { nights: 0, notifs: 0, emails: 0, discord: 0 }; // column/table missing → no-op

  let notifs = 0;
  let emails = 0;
  let discord = 0;
  let nightsSent = 0;

  for (const n of ((nights ?? []) as NightRow[])) {
    // Atomic claim — only the first runner to flip NULL → now proceeds.
    const { data: claimed } = await admin
      .from("board_game_nights")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", n.id)
      .is("reminder_sent_at", null)
      .select("id");
    if (!claimed?.length) continue;
    nightsSent += 1;

    // Announce to the host's Discord "game nights" channel (best-effort; no-ops
    // cleanly if Discord isn't installed/routed for this host). Fires once per
    // night, independent of RSVP count.
    if (n.starts_at) {
      const when = formatEventTime(n.starts_at, n.timezone);
      const res = await postAnnouncementToCategory({
        ownerUserId: n.host_id,
        category: "game_nights",
        title: `🎮 Game night coming up: ${n.title}`,
        body: `${when}${n.place ? ` · ${n.place}` : ""}`,
        url: `${base}/board-game-nights/${n.id}`,
      }).catch(() => ({ ok: false as const, reason: "error" }));
      if (res.ok) discord += 1;
    }

    const { data: rsvps } = await admin
      .from("board_game_night_rsvps")
      .select("user_id")
      .eq("night_id", n.id)
      .eq("status", "going");
    const userIds = [...new Set(((rsvps ?? []) as { user_id: string }[]).map((r) => r.user_id))];
    if (!userIds.length) continue;

    const [{ data: dir }, { data: us }] = await Promise.all([
      admin.from("user_directory").select("id, email").in("id", userIds),
      admin.from("users").select("id, timezone, display_name").in("id", userIds),
    ]);
    const emailById = new Map<string, string>();
    for (const r of dir ?? []) if (r.email) emailById.set(r.id, r.email as string);
    const tzById = new Map<string, string | null>();
    const nameById = new Map<string, string | null>();
    for (const r of us ?? []) {
      tzById.set(r.id, (r.timezone as string | null) ?? null);
      nameById.set(r.id, (r.display_name as string | null) ?? null);
    }

    const url = `${base}/board-game-nights/${n.id}`;
    for (const uid of userIds) {
      const tz = tzById.get(uid) ?? null;
      await createNotification({
        userId: uid,
        type: "game_night_reminder",
        title: "Game night coming up",
        message: `${n.title} ${n.starts_at ? formatEventTime(n.starts_at, tz) : "soon"}`,
        link: `/board-game-nights/${n.id}`,
        data: { nightId: n.id },
      });
      notifs += 1;

      const email = emailById.get(uid);
      if (email && n.starts_at) {
        const res = await sendNightReminderEmail({
          to: email,
          toName: nameById.get(uid) ?? undefined,
          nightTitle: n.title,
          startIso: n.starts_at,
          place: n.place,
          nightUrl: url,
          viewerTz: tz,
        });
        if (res.ok) emails += 1;
      }
    }
  }

  return { nights: nightsSent, notifs, emails, discord };
}
