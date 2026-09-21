import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import { getBaseUrl } from "@/lib/env";
import { formatEventTime } from "@/lib/time/format";
import { sendTournamentReminderEmail } from "@/lib/email/tournament";
import { sendNightReminderEmail } from "@/lib/email/game-nights";
import { postAnnouncementToCategory } from "@/lib/adapters/discord";
import { listAttendees, type Attendee } from "./attendees";
import { deliver, type Recipient } from "./notify";
import type { EventType } from "./calendar";

/**
 * One reminder engine for both event types (events plan, step 5).
 *
 *   day  band: starts in 1–24h   → "coming up" reminder
 *   hour band: starts in <1h     → "starting soon" reminder
 *
 * Each (event, attendee, band) is claimed in `event_reminders_sent` before
 * dispatch, so overlapping cron runs never double-send. Delivery goes through
 * `deliver()` (in-app + email now, SMS seam). Game nights additionally get the
 * once-per-night Discord announce on the day band (claimed via the night's
 * `reminder_sent_at`, as before).
 */

const HOUR = 60 * 60 * 1000;
type Band = "day" | "hour";

interface Upcoming {
  type: EventType;
  id: string;
  title: string;
  startsAt: string;
  place: string | null;
  timezone: string | null;
  ownerId: string;
  href: string;
}

async function loadUpcoming(now: number): Promise<Upcoming[]> {
  const svc = createServiceClient();
  const from = new Date(now).toISOString();
  const to = new Date(now + 24 * HOUR).toISOString();
  const [t, n] = await Promise.all([
    svc.from("tournaments").select("id, title, date_time, status, organizer_id, settings").in("status", ["open", "in_progress"]).gt("date_time", from).lte("date_time", to),
    svc.from("board_game_nights").select("id, title, starts_at, status, host_id, place, timezone").eq("status", "scheduled").gt("starts_at", from).lte("starts_at", to),
  ]);
  return [
    ...((t.data ?? []) as { id: string; title: string; date_time: string; organizer_id: string; settings: { location?: string | null } | null }[]).map((r) => ({
      type: "tournament" as const, id: r.id, title: r.title, startsAt: r.date_time, place: r.settings?.location ?? null, timezone: null, ownerId: r.organizer_id, href: `/tournament/${r.id}`,
    })),
    ...((n.data ?? []) as { id: string; title: string; starts_at: string; host_id: string; place: string | null; timezone: string | null }[]).map((r) => ({
      type: "game-night" as const, id: r.id, title: r.title, startsAt: r.starts_at, place: r.place, timezone: r.timezone, ownerId: r.host_id, href: `/game-nights/${r.id}`,
    })),
  ];
}

/** Attendees who should hear about it: seat-holders only (no waitlist, no declines). */
function reminderTargets(type: EventType, attendees: Attendee[]): Attendee[] {
  return attendees.filter((a) => (type === "tournament" ? ["registered", "confirmed", "checked_in"].includes(a.status) : a.status === "going"));
}

async function recipientsFor(attendees: Attendee[]): Promise<Map<string, Recipient>> {
  const svc = createServiceClient();
  const userIds = [...new Set(attendees.map((a) => a.userId).filter((x): x is string => !!x))];
  const emailById = new Map<string, string>();
  const tzById = new Map<string, string | null>();
  if (userIds.length) {
    const [{ data: dir }, { data: us }] = await Promise.all([
      svc.from("user_directory").select("id, email").in("id", userIds),
      svc.from("users").select("id, timezone").in("id", userIds),
    ]);
    for (const r of (dir ?? []) as { id: string; email: string | null }[]) if (r.email) emailById.set(r.id, r.email);
    for (const r of (us ?? []) as { id: string; timezone: string | null }[]) tzById.set(r.id, r.timezone ?? null);
  }
  const out = new Map<string, Recipient>();
  for (const a of attendees) {
    out.set(a.id, {
      userId: a.userId,
      displayName: a.displayName,
      email: a.userId ? emailById.get(a.userId) ?? null : a.email ?? null,
      timezone: a.userId ? tzById.get(a.userId) ?? null : null,
    });
  }
  return out;
}

export interface ReminderRunResult { events: number; notifs: number; emails: number; discord: number; skipped: string | null }

export async function sendDueEventReminders(now = Date.now()): Promise<ReminderRunResult> {
  const svc = createServiceClient();
  // Guard: ledger table missing (migration not applied) → do nothing, say so.
  const probe = await svc.from("event_reminders_sent").select("event_id", { head: true, count: "exact" }).limit(1);
  if (probe.error) return { events: 0, notifs: 0, emails: 0, discord: 0, skipped: "event_reminders_sent missing" };

  const base = getBaseUrl();
  const bands: { key: Band; lo: number; hi: number }[] = [
    { key: "day", lo: now + HOUR, hi: now + 24 * HOUR },
    { key: "hour", lo: now, hi: now + HOUR },
  ];
  const upcoming = await loadUpcoming(now);
  let notifs = 0, emails = 0, discord = 0, events = 0;

  for (const ev of upcoming) {
    const start = Date.parse(ev.startsAt);
    const band = bands.find((b) => start > b.lo && start <= b.hi);
    if (!band) continue;
    events++;
    const url = `${base}${ev.href}`;

    // Game nights: one Discord announce per night, on the day band, claimed on the row.
    if (ev.type === "game-night" && band.key === "day") {
      const { data: claimed } = await svc.from("board_game_nights").update({ reminder_sent_at: new Date().toISOString() }).eq("id", ev.id).is("reminder_sent_at", null).select("id");
      if (claimed?.length) {
        const res = await postAnnouncementToCategory({
          ownerUserId: ev.ownerId, category: "game_nights",
          title: `🎮 Game night coming up: ${ev.title}`,
          body: `${formatEventTime(ev.startsAt, ev.timezone)}${ev.place ? ` · ${ev.place}` : ""}`,
          url,
        }).catch(() => ({ ok: false as const }));
        if (res.ok) discord++;
      }
    }

    const targets = reminderTargets(ev.type, await listAttendees(ev.type, ev.id));
    if (!targets.length) continue;
    const recipients = await recipientsFor(targets);

    for (const a of targets) {
      const key = ev.type === "tournament" ? a.id : (a.userId ?? a.id);
      const { error: claimErr } = await svc.from("event_reminders_sent").insert({ event_type: ev.type, event_id: ev.id, attendee_key: key, threshold: band.key });
      if (claimErr) continue; // already sent (or a concurrent run got it)
      const r = recipients.get(a.id)!;
      const when = formatEventTime(ev.startsAt, r.timezone ?? ev.timezone);
      const soon = band.key === "hour";
      const res = await deliver(r, {
        inApp: {
          type: ev.type === "tournament" ? "tournament_reminder" : "game_night_reminder",
          title: soon ? `${ev.type === "tournament" ? "Tournament" : "Game night"} starting soon` : `${ev.type === "tournament" ? "Tournament" : "Game night"} coming up`,
          message: `${ev.title} starts ${when}${ev.place && ev.type === "game-night" ? ` · ${ev.place}` : ""}`,
          link: ev.href,
          data: { eventType: ev.type, eventId: ev.id, threshold: band.key },
        },
        email: (rr) => ev.type === "tournament"
          ? sendTournamentReminderEmail({ to: rr.email!, toName: rr.displayName ?? undefined, tournamentTitle: ev.title, startIso: ev.startsAt, tournamentUrl: url, viewerTz: rr.timezone })
          : sendNightReminderEmail({ to: rr.email!, toName: rr.displayName ?? undefined, nightTitle: ev.title, startIso: ev.startsAt, place: ev.place, nightUrl: url, viewerTz: rr.timezone ?? ev.timezone }),
        sms: { body: `${ev.title} starts ${when}. ${url}` },
      });
      if (res.inApp) notifs++;
      if (res.email) emails++;
    }
  }
  return { events, notifs, emails, discord, skipped: null };
}
