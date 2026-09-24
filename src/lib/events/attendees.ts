import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { canHoldTicket, type AttendeeStatus } from "./ticketEligibility";

export { canHoldTicket };
export type { AttendeeStatus };
import { createNotification } from "@/lib/social/notifications";
import { sendTransactionalEmail } from "@/lib/email/mailersend";
import { getBaseUrl } from "@/lib/env";
import { deliver, type Recipient } from "./notify";
import { sendWaitlistPromotedEmail } from "@/lib/email/waitlist";
import type { EventType } from "./calendar";

/**
 * Shared attendee base for tournaments and game nights (events plan, step 4).
 *
 * One vocabulary over two tables:
 *   tournaments  → tournament_participants (status registered/confirmed/
 *                  checked_in/dropped/waitlisted, checked_in_at, waitlisted_at)
 *   game nights  → board_game_night_rsvps (status going/maybe/declined/
 *                  waitlisted, checked_in_at, waitlisted_at)
 *
 * Everything here runs on the service client after an explicit permission
 * check (`canManageEvent` for organizer actions, the attendee's own id for
 * tickets), so RLS differences between the two tables never leak into the UI.
 */


export interface Attendee {
  /** Participant row id (tournaments) or `${nightId}:${userId}` (nights). */
  id: string;
  userId: string | null;
  displayName: string;
  username: string | null;
  avatar: { id: string; avatar_source?: string | null; avatar_seed?: string | null; avatar_options?: Record<string, string> | null; discord_avatar?: string | null; twitch_avatar?: string | null } | null;
  status: AttendeeStatus;
  joinedAt: string | null;
  checkedInAt: string | null;
  /** Tournaments: friend code / discord the player shared; guests: claim email. */
  friendCode?: string | null;
  discord?: string | null;
  email?: string | null;
  team?: number | null;
}

export interface EventMeta {
  type: EventType;
  id: string;
  title: string;
  ownerId: string;
  capacity: number | null;
  startsAt: string | null;
  href: string;
  /** Tournaments: manual approval means a promoted waitlister becomes `registered`, not `confirmed`. */
  autoAccept: boolean;
}

const ACTIVE_T: AttendeeStatus[] = ["registered", "confirmed", "checked_in"];

// ─── event meta + permissions ────────────────────────────────────────────────

export async function getEventMeta(type: EventType, id: string): Promise<EventMeta | null> {
  const svc = createServiceClient();
  if (type === "tournament") {
    const { data } = await svc.from("tournaments").select("id, title, organizer_id, max_participants, date_time, acceptance_mode").eq("id", id).maybeSingle();
    if (!data) return null;
    return { type, id, title: data.title as string, ownerId: data.organizer_id as string, capacity: (data.max_participants as number | null) ?? null, startsAt: (data.date_time as string | null) ?? null, href: `/tournament/${id}`, autoAccept: data.acceptance_mode === "auto" };
  }
  const { data } = await svc.from("board_game_nights").select("id, title, host_id, capacity, starts_at").eq("id", id).maybeSingle();
  if (!data) return null;
  return { type, id, title: data.title as string, ownerId: data.host_id as string, capacity: (data.capacity as number | null) ?? null, startsAt: (data.starts_at as string | null) ?? null, href: `/game-nights/${id}`, autoAccept: true };
}

export async function canManageEvent(type: EventType, id: string, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const meta = await getEventMeta(type, id);
  if (!meta) return false;
  if (meta.ownerId === userId) return true;
  if (type !== "tournament") return false;
  const svc = createServiceClient();
  const { data } = await svc.from("tournament_organizers").select("user_id").eq("tournament_id", id).eq("user_id", userId).maybeSingle();
  return !!data;
}

// ─── listing ─────────────────────────────────────────────────────────────────

const USER_COLS = "id, display_name, username, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar";
type UserRow = { id: string; display_name: string | null; username: string | null; avatar_source?: string | null; avatar_seed?: string | null; avatar_options?: Record<string, string> | null; discord_avatar?: string | null; twitch_avatar?: string | null };

async function usersById(ids: string[]): Promise<Map<string, UserRow>> {
  if (ids.length === 0) return new Map();
  const svc = createServiceClient();
  const { data } = await svc.from("users").select(USER_COLS).in("id", ids);
  return new Map(((data ?? []) as UserRow[]).map((u) => [u.id, u]));
}

const avatarOf = (u: UserRow | undefined, fallbackId: string) =>
  u ? { id: u.id, avatar_source: u.avatar_source, avatar_seed: u.avatar_seed, avatar_options: u.avatar_options, discord_avatar: u.discord_avatar, twitch_avatar: u.twitch_avatar } : { id: fallbackId };

export async function listAttendees(type: EventType, id: string): Promise<Attendee[]> {
  const svc = createServiceClient();
  if (type === "tournament") {
    // Guarded select: checked_in_at / waitlisted_at arrive with events-attendees-m1.
    const base = "id, user_id, display_name, friend_code, discord_username, status, joined_at, team";
    const q = (cols: string) => svc.from("tournament_participants").select(cols).eq("tournament_id", id).order("joined_at", { ascending: true });
    let res: { data: unknown; error: unknown } = await q(`${base}, checked_in_at, waitlisted_at`);
    if (res.error) res = await q(base);
    const rows = ((res.data as unknown[] | null) ?? []) as { id: string; user_id: string | null; display_name: string; friend_code: string | null; discord_username: string | null; status: string; joined_at: string; team: number | null; checked_in_at?: string | null }[];
    const users = await usersById(rows.map((r) => r.user_id).filter((x): x is string => !!x));
    const { data: claims } = await svc.from("tournament_guest_claims").select("participant_id, email").eq("tournament_id", id);
    const email = new Map(((claims ?? []) as { participant_id: string; email: string }[]).map((c) => [c.participant_id, c.email]));
    return rows.map((r) => {
      const u = r.user_id ? users.get(r.user_id) : undefined;
      return {
        id: r.id, userId: r.user_id, displayName: u?.display_name || r.display_name || "Player", username: u?.username ?? null,
        avatar: r.user_id ? avatarOf(u, r.user_id) : null,
        status: (r.status as AttendeeStatus) ?? "registered", joinedAt: r.joined_at,
        checkedInAt: r.checked_in_at ?? (r.status === "checked_in" ? r.joined_at : null),
        friendCode: r.friend_code, discord: r.discord_username, email: r.user_id ? null : email.get(r.id) ?? null, team: r.team,
      };
    });
  }
  const base = "user_id, status, created_at";
  const q = (cols: string) => svc.from("board_game_night_rsvps").select(cols).eq("night_id", id).order("created_at", { ascending: true });
  let res: { data: unknown; error: unknown } = await q(`${base}, checked_in_at, waitlisted_at`);
  if (res.error) res = await q(base);
  const rows = ((res.data as unknown[] | null) ?? []) as { user_id: string; status: string; created_at: string; checked_in_at?: string | null }[];
  const users = await usersById(rows.map((r) => r.user_id));
  return rows.map((r) => {
    const u = users.get(r.user_id);
    return { id: `${id}:${r.user_id}`, userId: r.user_id, displayName: u?.display_name || u?.username || "Player", username: u?.username ?? null, avatar: avatarOf(u, r.user_id), status: r.status as AttendeeStatus, joinedAt: r.created_at, checkedInAt: r.checked_in_at ?? null };
  });
}

/** Seats taken toward capacity (tournaments: registered/confirmed/checked_in; nights: going). */
export function countTaken(type: EventType, attendees: Attendee[]): number {
  return attendees.filter((a) => (type === "tournament" ? ACTIVE_T.includes(a.status) : a.status === "going")).length;
}

// ─── check-in ────────────────────────────────────────────────────────────────

export async function setCheckIn(type: EventType, eventId: string, attendeeId: string, checked: boolean): Promise<{ ok: boolean; error?: string; attendee?: Attendee }> {
  const svc = createServiceClient();
  const at = checked ? new Date().toISOString() : null;
  if (type === "tournament") {
    const { data: row } = await svc.from("tournament_participants").select("id, status").eq("id", attendeeId).eq("tournament_id", eventId).maybeSingle();
    if (!row) return { ok: false, error: "not_found" };
    if (row.status === "dropped" || row.status === "waitlisted") return { ok: false, error: "not_active" };
    const status = checked ? "checked_in" : row.status === "checked_in" ? "confirmed" : row.status;
    const { error } = await svc.from("tournament_participants").update({ status, checked_in_at: at }).eq("id", attendeeId);
    if (error) return { ok: false, error: error.message };
  } else {
    const [nightId, userId] = attendeeId.split(":");
    if (nightId !== eventId || !userId) return { ok: false, error: "not_found" };
    const { error } = await svc.from("board_game_night_rsvps").update({ checked_in_at: at }).eq("night_id", nightId).eq("user_id", userId);
    if (error) return { ok: false, error: error.message };
  }
  const attendee = (await listAttendees(type, eventId)).find((a) => a.id === attendeeId);
  return { ok: true, attendee };
}

// ─── waitlist ────────────────────────────────────────────────────────────────

/** Promote the longest-waiting attendee if a seat is free. Notifies them. */
/** Email and timezone for someone just promoted, so the seam can reach them. */
async function promotionRecipient(a: Attendee): Promise<Recipient> {
  let email = a.email ?? null;
  let timezone: string | null = null;
  if (a.userId) {
    const svc = createServiceClient();
    const [{ data: dir }, { data: u }] = await Promise.all([
      svc.from("user_directory").select("email").eq("id", a.userId).maybeSingle(),
      svc.from("users").select("timezone").eq("id", a.userId).maybeSingle(),
    ]);
    email = (dir?.email as string | null) ?? email;
    timezone = (u?.timezone as string | null) ?? null;
  }
  return { userId: a.userId ?? null, displayName: a.displayName ?? null, email, timezone };
}

export async function promoteFromWaitlist(type: EventType, eventId: string): Promise<Attendee | null> {
  const meta = await getEventMeta(type, eventId);
  if (!meta) return null;
  const attendees = await listAttendees(type, eventId);
  if (meta.capacity != null && countTaken(type, attendees) >= meta.capacity) return null;
  const next = attendees.filter((a) => a.status === "waitlisted").sort((a, b) => (a.joinedAt ?? "").localeCompare(b.joinedAt ?? ""))[0];
  if (!next) return null;

  const svc = createServiceClient();
  if (type === "tournament") {
    const { error } = await svc.from("tournament_participants").update({ status: meta.autoAccept ? "confirmed" : "registered", waitlisted_at: null }).eq("id", next.id);
    if (error) return null;
  } else {
    const [, userId] = next.id.split(":");
    const { error } = await svc.from("board_game_night_rsvps").update({ status: "going", waitlisted_at: null }).eq("night_id", eventId).eq("user_id", userId);
    if (error) return null;
  }
  // A spot opening up is the most time-sensitive thing the events system says.
  // An in-app notification alone only lands if they happen to come back, so this
  // goes through the full delivery seam: alert, email, and a text for anyone who
  // asked for event messages.
  if (next.userId || next.email) {
    const base = getBaseUrl();
    const url = `${base}${meta.href}`;
    const recipient = await promotionRecipient(next);
    await deliver(recipient, {
      inApp: {
        type: type === "tournament" ? "tournament_update" : "game_night_rsvp",
        title: `A spot opened up: you're in for ${meta.title}`,
        message: meta.autoAccept ? "You've been moved off the waitlist." : "You've been moved off the waitlist; the organizer will confirm you.",
        link: meta.href,
        data: { eventType: type, eventId, promoted: true },
      },
      email: (r) => sendWaitlistPromotedEmail({
        to: r.email!, toName: r.displayName, eventTitle: meta.title, startIso: meta.startsAt,
        eventUrl: url, needsOrganizerConfirmation: !meta.autoAccept, viewerTz: r.timezone,
      }),
      sms: {
        body: `A spot opened up for ${meta.title}. You're in. ${url}`,
        category: "event_reminders", billedUserId: meta.ownerId, eventType: type, eventId,
      },
    }).catch(() => {});
  }
  return { ...next, status: type === "tournament" ? (meta.autoAccept ? "confirmed" : "registered") : "going" };
}

// ─── messaging ───────────────────────────────────────────────────────────────

export type MessageAudience = "all" | "going" | "waitlisted" | "checked_in";

export async function messageAttendees(args: { type: EventType; eventId: string; senderId: string; subject: string; body: string; audience: MessageAudience; sms?: boolean }): Promise<{ sent: number; emailed: number; texted: number }> {
  const meta = await getEventMeta(args.type, args.eventId);
  if (!meta) return { sent: 0, emailed: 0, texted: 0 };
  const all = await listAttendees(args.type, args.eventId);
  const pick = (a: Attendee) => {
    if (args.audience === "waitlisted") return a.status === "waitlisted";
    if (args.audience === "checked_in") return !!a.checkedInAt || a.status === "checked_in";
    if (args.audience === "going") return args.type === "tournament" ? ACTIVE_T.includes(a.status) : a.status === "going";
    return a.status !== "dropped" && a.status !== "declined";
  };
  const targets = all.filter(pick);
  const subject = args.subject.trim().slice(0, 120);
  const body = args.body.trim().slice(0, 4000);
  const link = meta.href;

  let sent = 0;
  const userIds = targets.map((t) => t.userId).filter((x): x is string => !!x);
  await Promise.all(userIds.map((uid) =>
    createNotification({ userId: uid, type: args.type === "tournament" ? "tournament_update" : "game_night_rsvp", title: `${meta.title}: ${subject}`, message: body.slice(0, 500), actorUserId: args.senderId, link, data: { eventType: args.type, eventId: args.eventId, kind: "organizer_message" } })
      .then(() => { sent++; })
      .catch(() => {}),
  ));

  // Email: account holders' auth emails + guest claim emails. Non-prod logs instead of sending.
  const svc = createServiceClient();
  const emails = new Map<string, string>();
  if (userIds.length) {
    const { data } = await svc.from("user_directory").select("id, email, display_name").in("id", userIds);
    for (const r of (data ?? []) as { id: string; email: string | null; display_name: string | null }[]) if (r.email) emails.set(r.email, r.display_name ?? "");
  }
  for (const t of targets) if (!t.userId && t.email) emails.set(t.email, t.displayName);
  const absolute = `${getBaseUrl()}${link}`;
  let emailed = 0;
  await Promise.all([...emails.entries()].map(([to, toName]) =>
    sendTransactionalEmail({
      to, toName: toName || undefined,
      subject: `${meta.title}: ${subject}`,
      text: `${body}\n\n${absolute}`,
      html: `<p>${escapeHtml(body).replace(/\n/g, "<br/>")}</p><p><a href="${absolute}">${escapeHtml(meta.title)}</a></p>`,
    }).then((r) => { if (r?.ok) emailed++; }).catch(() => {}),
  ));
  // SMS: opt-in recipients only, billed to the organizer's allowance.
  let texted = 0;
  if (args.sms) {
    const { sendSms } = await import("@/lib/sms/send");
    for (const uid of userIds) {
      const res = await sendSms({ toUserId: uid, category: "organizer_messages", body: `${meta.title}: ${subject}`, billedUserId: meta.ownerId, eventType: args.type, eventId: args.eventId }).catch(() => ({ ok: false as const }));
      if (res.ok) texted++;
    }
  }
  return { sent, emailed, texted };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── tickets (signed ids, nothing stored) ────────────────────────────────────

function ticketSecret(): string {
  const s = process.env.TICKET_SIGNING_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("No ticket signing secret configured");
  return s;
}

/** `gs1.<type>.<eventId>.<attendeeId>.<sig>` — what the QR encodes. */
export function ticketToken(type: EventType, eventId: string, attendeeId: string): string {
  const payload = `${type}.${eventId}.${attendeeId}`;
  const sig = createHmac("sha256", ticketSecret()).update(payload).digest("base64url").slice(0, 22);
  return `gs1.${payload}.${sig}`;
}

export function verifyTicket(token: string): { type: EventType; eventId: string; attendeeId: string } | null {
  const m = /^gs1\.(tournament|game-night)\.([^.]+)\.([^.]+)\.([A-Za-z0-9_-]{22})$/.exec(token.trim());
  if (!m) return null;
  const [, type, eventId, attendeeId, sig] = m;
  const expected = createHmac("sha256", ticketSecret()).update(`${type}.${eventId}.${attendeeId}`).digest("base64url").slice(0, 22);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { type: type as EventType, eventId, attendeeId };
}

/** Human-typeable fallback for the scanner (last 6 of the signature, upper-cased). */
export function ticketShortCode(token: string): string {
  return token.slice(-6).toUpperCase();
}

/** The signed-in user's own attendee row for an event (for the ticket view). */
export async function myAttendee(type: EventType, eventId: string, userId: string): Promise<Attendee | null> {
  const all = await listAttendees(type, eventId);
  return all.find((a) => a.userId === userId) ?? null;
}

export function attendeesToCsv(type: EventType, rows: Attendee[]): string {
  const head = type === "tournament" ? ["name", "username", "status", "team", "friend_code", "discord", "email", "joined_at", "checked_in_at"] : ["name", "username", "status", "joined_at", "checked_in_at"];
  const cell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = rows.map((a) => (type === "tournament"
    ? [a.displayName, a.username, a.status, a.team, a.friendCode, a.discord, a.email, a.joinedAt, a.checkedInAt]
    : [a.displayName, a.username, a.status, a.joinedAt, a.checkedInAt]).map(cell).join(","));
  return [head.join(","), ...lines].join("\n") + "\n";
}
