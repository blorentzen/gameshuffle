import "server-only";

/**
 * The waitlist engine for tournaments and game nights (service role). Rules in
 * ./waitlistRules.ts; decisions: https://claude.ai/artifact/VGCbh3KiXEPLz4MKUTmJ7v
 *
 *   join → waitlisted (back of the line, within the organizer's optional cap)
 *   a seat opens → fillOpenSeats: the next person gets an OFFER (it holds the
 *     seat) that lasts 24h / 4h / 1h depending on how close the event is
 *   claim → seated (paid events: through checkout, the offer holding the seat)
 *   pass / offer runs out → back of the line, and the next person gets it
 *   last 2 hours → STANDBY: waitlisted people checked in at the venue are
 *     seated first, then anyone waiting can claim an open spot
 *
 * Every place a seat can open calls fillOpenSeats: a withdrawal, a no-show
 * drop, a refund, an expired ticket hold, a declined RSVP, a raised cap. The
 * database guard (waitlist-offers-m1) stops players writing their way past any
 * of this; everything here runs on the service client after its own checks.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { getBaseUrl } from "@/lib/env";
import {
  getEventMeta, listAttendees, offerToken, promotionRecipient,
  type Attendee, type EventMeta,
} from "./attendees";
import { deliver } from "./notify";
import { sendWaitlistOfferEmail, sendWaitlistPromotedEmail } from "@/lib/email/waitlist";
import { isPaidEvent, ticketSeatsBeyondRows } from "./tickets";
import { lineOrder, offerExpiry, offerPlan, seatStatuses, timeLeft } from "./waitlistRules";
import type { EventType } from "./calendar";

export type WaitlistError =
  | "not_found" | "not_waitlisted" | "no_offer" | "offer_expired" | "pay" | "too_late"
  | "waitlist_full" | "already_in" | "no_waitlist" | "failed";
export type WaitlistResult = { ok: true; attendee: Attendee | null } | { ok: false; error: WaitlistError };

const seatTarget = (type: EventType, meta: EventMeta) => (type === "tournament" ? (meta.autoAccept ? "confirmed" : "registered") : "going");
const asLine = (a: Attendee) => ({ ...a, rank: a.rank ?? null, waitlistedAt: a.waitlistedAt ?? null, joinedAt: a.joinedAt });

async function updateRow(type: EventType, eventId: string, attendeeId: string, patch: Record<string, unknown>, onlyIfStatus?: string): Promise<boolean> {
  const svc = createServiceClient();
  let q = type === "tournament"
    ? svc.from("tournament_participants").update(patch).eq("id", attendeeId).eq("tournament_id", eventId)
    : svc.from("board_game_night_rsvps").update(patch).eq("night_id", eventId).eq("user_id", attendeeId.split(":")[1] ?? "");
  if (onlyIfStatus) q = q.eq("status", onlyIfStatus);
  const { data, error } = await q.select(type === "tournament" ? "id" : "user_id");
  return !error && !!data && data.length > 0;
}

/** Seats in use: seat rows (an offer holds one) plus tickets sold or held that aren't rows yet. */
async function seatsInUse(type: EventType, eventId: string, attendees: Attendee[]): Promise<number> {
  const seats = seatStatuses(type);
  return attendees.filter((a) => seats.includes(a.status)).length + (await ticketSeatsBeyondRows(type, eventId));
}

/** Free seats (Infinity when there's no cap). */
async function freeSeats(type: EventType, meta: EventMeta, attendees: Attendee[]): Promise<number> {
  if (meta.capacity == null) return Number.POSITIVE_INFINITY;
  return meta.capacity - (await seatsInUse(type, meta.id, attendees));
}

function claimLink(type: EventType, meta: EventMeta, a: Attendee): string {
  return `${getBaseUrl()}/waitlist/${offerToken(type, meta.id, a.id)}`;
}

async function notifyOffer(type: EventType, meta: EventMeta, a: Attendee, expiresAt: Date | null, paid: boolean): Promise<void> {
  const recipient = await promotionRecipient(a);
  if (!recipient.userId && !recipient.email) return;
  const url = claimLink(type, meta, a);
  const left = expiresAt ? timeLeft(expiresAt.getTime() - Date.now()) : null;
  await deliver(recipient, {
    inApp: {
      type: type === "tournament" ? "tournament_update" : "game_night_rsvp",
      title: left ? `A spot opened for ${meta.title}` : `Open spot for ${meta.title}: first to claim`,
      message: left ? `It's yours if you want it. Claim it in the next ${left}.` : "It starts soon, so the first person on the waitlist to claim it gets it.",
      link: meta.href,
      data: { eventType: type, eventId: meta.id, waitlist: left ? "offer" : "standby" },
    },
    email: (r) => sendWaitlistOfferEmail({
      to: r.email!, toName: r.displayName, eventTitle: meta.title, startIso: meta.startsAt,
      claimUrl: url, expiresIso: expiresAt?.toISOString() ?? null, paid, viewerTz: r.timezone,
    }),
    sms: {
      body: left ? `A spot opened for ${meta.title}. Claim it in the next ${left}: ${url}` : `Open spot for ${meta.title}, first to claim gets it: ${url}`,
      category: "event_reminders", billedUserId: meta.ownerId, eventType: type, eventId: meta.id,
    },
  }).catch(() => {});
}

async function notifySeated(type: EventType, meta: EventMeta, a: Attendee): Promise<void> {
  const recipient = await promotionRecipient(a);
  if (!recipient.userId && !recipient.email) return;
  const url = `${getBaseUrl()}${meta.href}`;
  await deliver(recipient, {
    inApp: {
      type: type === "tournament" ? "tournament_update" : "game_night_rsvp",
      title: `You're in for ${meta.title}`,
      message: meta.autoAccept ? "You've been moved off the waitlist." : "You've been moved off the waitlist; the organizer will confirm you.",
      link: meta.href,
      data: { eventType: type, eventId: meta.id, promoted: true },
    },
    email: (r) => sendWaitlistPromotedEmail({
      to: r.email!, toName: r.displayName, eventTitle: meta.title, startIso: meta.startsAt,
      eventUrl: url, needsOrganizerConfirmation: !meta.autoAccept, viewerTz: r.timezone,
    }),
    sms: { body: `You're in for ${meta.title}. ${url}`, category: "event_reminders", billedUserId: meta.ownerId, eventType: type, eventId: meta.id },
  }).catch(() => {});
}

/** Make an offer (status offered, holding the seat). `expiresAt` null = a standby seat hold of 15 minutes. */
async function offer(type: EventType, meta: EventMeta, a: Attendee, expiresAt: Date, paid: boolean, fromStatus = "waitlisted"): Promise<boolean> {
  const ok = await updateRow(type, meta.id, a.id, { status: "offered", offer_expires_at: expiresAt.toISOString() }, fromStatus);
  if (ok) await notifyOffer(type, meta, a, expiresAt, paid);
  return ok;
}

async function seat(type: EventType, meta: EventMeta, a: Attendee, fromStatus?: string): Promise<boolean> {
  const ok = await updateRow(type, meta.id, a.id, { status: seatTarget(type, meta), offer_expires_at: null, waitlisted_at: null, waitlist_rank: null }, fromStatus);
  if (ok) await notifySeated(type, meta, a);
  return ok;
}

/** Back of the line: unranked, and the newest to have joined it. */
async function toBackOfLine(type: EventType, eventId: string, a: Attendee, fromStatus: string): Promise<boolean> {
  return updateRow(type, eventId, a.id, { status: "waitlisted", offer_expires_at: null, waitlist_rank: null, waitlisted_at: new Date().toISOString() }, fromStatus);
}

/**
 * A seat may have opened. Far from the start: offer it to the next person in
 * line (one offer per free seat). In the last stretch: seat waitlisted people
 * already checked in at the venue, then call everyone else for standby.
 */
export async function fillOpenSeats(type: EventType, eventId: string): Promise<{ touched: Attendee[]; standby: boolean }> {
  const touched: Attendee[] = [];
  const meta = await getEventMeta(type, eventId);
  if (!meta) return { touched, standby: false };
  const attendees = await listAttendees(type, eventId);
  const line = lineOrder(attendees.map(asLine));
  if (!line.length) return { touched, standby: false };
  let free = await freeSeats(type, meta, attendees);
  if (free <= 0) return { touched, standby: false };
  const paid = await isPaidEvent(type, eventId);
  const plan = offerPlan(meta.startsAt);

  if (plan.kind === "standby") {
    // People already at the venue go first (free events: straight in; paid: an offer, they still pay).
    for (const a of line.filter((x) => x.checkedInAt)) {
      if (free <= 0) break;
      const done = paid ? await offer(type, meta, a, new Date(Date.now() + 15 * 60 * 1000), paid) : await seat(type, meta, a, "waitlisted");
      if (done) { touched.push(a); free--; }
    }
    if (free > 0) {
      // Everyone else still waiting hears there's a spot; first to claim gets it.
      for (const a of line.filter((x) => !touched.includes(x))) await notifyOffer(type, meta, a, null, paid);
    }
    return { touched, standby: true };
  }

  const expiresAt = offerExpiry(meta.startsAt)!;
  for (const a of line) {
    if (free <= 0) break;
    if (await offer(type, meta, a, expiresAt, paid)) { touched.push(a); free--; }
  }
  return { touched, standby: false };
}

/**
 * Where a new person goes: a seat, the waitlist (full, or people already
 * waiting), or tickets (paid events seat through checkout only).
 */
export async function joinDecision(type: EventType, eventId: string): Promise<"seat" | "waitlist" | "paid" | "waitlist_full" | "not_found"> {
  const meta = await getEventMeta(type, eventId);
  if (!meta) return "not_found";
  if (await isPaidEvent(type, eventId)) return "paid";
  const attendees = await listAttendees(type, eventId);
  const waiting = attendees.some((a) => a.status === "waitlisted" || a.status === "offered");
  if (!waiting && (await freeSeats(type, meta, attendees)) > 0) return "seat";
  if (meta.waitlistCap != null && attendees.filter((a) => a.status === "waitlisted").length >= meta.waitlistCap) return "waitlist_full";
  return "waitlist";
}

/** The database guard's refusals, as join decisions. */
export function guardError(message: string | undefined): "waitlist" | "paid" | "waitlist_full" | "needs_approval" | null {
  if (!message) return null;
  if (/event_full|waitlist_first/.test(message)) return "waitlist";
  if (/paid_event/.test(message)) return "paid";
  if (/waitlist_full/.test(message)) return "waitlist_full";
  if (/needs_approval/.test(message)) return "needs_approval";
  return null;
}

/** The attendee id for a signed-in viewer (tournaments: their row; nights: night:user). */
export async function attendeeIdFor(type: EventType, eventId: string, userId: string): Promise<string | null> {
  if (type === "game-night") return `${eventId}:${userId}`;
  const { data } = await createServiceClient().from("tournament_participants").select("id").eq("tournament_id", eventId).eq("user_id", userId).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function findAttendee(type: EventType, eventId: string, attendeeId: string): Promise<Attendee | null> {
  return (await listAttendees(type, eventId)).find((a) => a.id === attendeeId) ?? null;
}

/**
 * Claim: an offer becomes a seat; in standby, a waitlisted person takes an open
 * spot. Paid events answer `pay` (the caller sends them to checkout, which
 * honours the offer's held seat).
 */
export async function claim(type: EventType, eventId: string, attendeeId: string): Promise<WaitlistResult> {
  const meta = await getEventMeta(type, eventId);
  const a = await findAttendee(type, eventId, attendeeId);
  if (!meta || !a) return { ok: false, error: "not_found" };
  const paid = await isPaidEvent(type, eventId);

  if (a.status === "offered") {
    if (a.offerExpiresAt && Date.parse(a.offerExpiresAt) <= Date.now()) {
      await expireOne(type, meta, a);
      return { ok: false, error: "offer_expired" };
    }
    if (paid) return { ok: false, error: "pay" };
    return (await seat(type, meta, a, "offered")) ? { ok: true, attendee: a } : { ok: false, error: "too_late" };
  }

  if (a.status === "waitlisted" && offerPlan(meta.startsAt).kind === "standby") {
    const attendees = await listAttendees(type, eventId);
    if ((await freeSeats(type, meta, attendees)) <= 0) return { ok: false, error: "too_late" };
    if (paid) {
      // Hold the spot for 15 minutes while they pay.
      return (await offer(type, meta, a, new Date(Date.now() + 15 * 60 * 1000), paid)) ? { ok: false, error: "pay" } : { ok: false, error: "too_late" };
    }
    if (!(await seat(type, meta, a, "waitlisted"))) return { ok: false, error: "too_late" };
    // Two people can claim the last spot at the same moment: whoever pushed it over goes back in line.
    const after = await listAttendees(type, eventId);
    if (meta.capacity != null && (await seatsInUse(type, eventId, after)) > meta.capacity) {
      await updateRow(type, eventId, a.id, { status: "waitlisted", waitlisted_at: a.waitlistedAt ?? new Date().toISOString() });
      return { ok: false, error: "too_late" };
    }
    return { ok: true, attendee: a };
  }
  return { ok: false, error: a.status === "waitlisted" ? "no_offer" : "not_waitlisted" };
}

/** Not this time: back of the line, and the next person gets the offer. */
export async function pass(type: EventType, eventId: string, attendeeId: string): Promise<WaitlistResult> {
  const a = await findAttendee(type, eventId, attendeeId);
  if (!a) return { ok: false, error: "not_found" };
  if (a.status !== "offered") return { ok: false, error: "no_offer" };
  if (!(await toBackOfLine(type, eventId, a, "offered"))) return { ok: false, error: "failed" };
  await fillOpenSeats(type, eventId);
  return { ok: true, attendee: a };
}

/** Off the waitlist entirely (an offer they held goes to the next person). */
export async function leave(type: EventType, eventId: string, attendeeId: string): Promise<WaitlistResult> {
  const a = await findAttendee(type, eventId, attendeeId);
  if (!a) return { ok: false, error: "not_found" };
  if (a.status !== "waitlisted" && a.status !== "offered") return { ok: false, error: "not_waitlisted" };
  const ok = await updateRow(type, eventId, a.id, { status: type === "tournament" ? "dropped" : "declined", offer_expires_at: null, waitlist_rank: null }, a.status);
  if (!ok) return { ok: false, error: "failed" };
  if (a.status === "offered") await fillOpenSeats(type, eventId);
  return { ok: true, attendee: a };
}

async function expireOne(type: EventType, meta: EventMeta, a: Attendee): Promise<void> {
  // Mid-checkout on a paid event: the ticket hold keeps the offer alive until it ends.
  const { data: hold } = await createServiceClient().from("gs_ticket_orders").select("expires_at")
    .eq("event_type", type).eq("event_id", meta.id).eq("status", "held").gt("expires_at", new Date().toISOString())
    .eq("buyer_user_id", a.userId ?? "00000000-0000-0000-0000-000000000000").limit(1);
  if (hold && hold.length) return;
  if (!(await toBackOfLine(type, meta.id, a, "offered"))) return;
  if (a.userId) {
    const recipient = await promotionRecipient(a);
    await deliver(recipient, {
      inApp: {
        type: type === "tournament" ? "tournament_update" : "game_night_rsvp",
        title: `Your spot for ${meta.title} went to the next person`,
        message: "The offer ran out. You're still on the waitlist, at the back of the line.",
        link: meta.href, data: { eventType: type, eventId: meta.id, waitlist: "expired" },
      },
    }).catch(() => {});
  }
  await fillOpenSeats(type, meta.id);
}

/** Cron: offers past their deadline move on. Returns how many expired. */
export async function expireOffers(): Promise<number> {
  const svc = createServiceClient();
  const now = new Date().toISOString();
  const [t, n] = await Promise.all([
    svc.from("tournament_participants").select("id, tournament_id").eq("status", "offered").lt("offer_expires_at", now).limit(200),
    svc.from("board_game_night_rsvps").select("night_id, user_id").eq("status", "offered").lt("offer_expires_at", now).limit(200),
  ]);
  if (t.error && n.error) return 0; // pre-migration
  let count = 0;
  const due: { type: EventType; eventId: string; attendeeId: string }[] = [
    ...((t.data ?? []) as { id: string; tournament_id: string }[]).map((r) => ({ type: "tournament" as const, eventId: r.tournament_id, attendeeId: r.id })),
    ...((n.data ?? []) as { night_id: string; user_id: string }[]).map((r) => ({ type: "game-night" as const, eventId: r.night_id, attendeeId: `${r.night_id}:${r.user_id}` })),
  ];
  for (const d of due) {
    const meta = await getEventMeta(d.type, d.eventId);
    const a = meta ? await findAttendee(d.type, d.eventId, d.attendeeId) : null;
    if (!meta || !a || a.status !== "offered") continue;
    await expireOne(d.type, meta, a);
    count++;
  }
  return count;
}

/** Join the line (server-side, so the waitlist cap and the line order hold). */
export async function joinWaitlist(type: EventType, eventId: string, who: { userId: string | null; displayName: string }): Promise<WaitlistResult & { attendeeId?: string }> {
  const meta = await getEventMeta(type, eventId);
  if (!meta) return { ok: false, error: "not_found" };
  const attendees = await listAttendees(type, eventId);
  const mine = who.userId ? attendees.find((a) => a.userId === who.userId) : undefined;
  if (mine && (seatStatuses(type).includes(mine.status) || mine.status === "waitlisted")) return { ok: false, error: "already_in" };
  if (meta.waitlistCap != null && attendees.filter((a) => a.status === "waitlisted").length >= meta.waitlistCap) return { ok: false, error: "waitlist_full" };
  const svc = createServiceClient();
  const now = new Date().toISOString();
  let attendeeId: string | null = null;
  if (type === "tournament") {
    if (mine) {
      await svc.from("tournament_participants").update({ status: "waitlisted", waitlisted_at: now, waitlist_rank: null, offer_expires_at: null }).eq("id", mine.id);
      attendeeId = mine.id;
    } else {
      const { data, error } = await svc.from("tournament_participants")
        .insert({ tournament_id: eventId, user_id: who.userId, display_name: who.displayName.slice(0, 60), status: "waitlisted", waitlisted_at: now })
        .select("id").single();
      if (error || !data) return { ok: false, error: "failed" };
      attendeeId = data.id as string;
    }
  } else {
    if (!who.userId) return { ok: false, error: "failed" };
    const { error } = await svc.from("board_game_night_rsvps")
      .upsert({ night_id: eventId, user_id: who.userId, status: "waitlisted", waitlisted_at: now, waitlist_rank: null, offer_expires_at: null }, { onConflict: "night_id,user_id" });
    if (error) return { ok: false, error: "failed" };
    attendeeId = `${eventId}:${who.userId}`;
  }
  // A seat might be free right now (or it's standby time): fill straight away.
  await fillOpenSeats(type, eventId);
  return { ok: true, attendee: await findAttendee(type, eventId, attendeeId), attendeeId };
}

// ─── organizer controls ──────────────────────────────────────────────────────

/** Set the line order (attendee ids, first in line first). */
export async function reorder(type: EventType, eventId: string, ids: string[]): Promise<boolean> {
  const line = new Set(lineOrder((await listAttendees(type, eventId)).map(asLine)).map((a) => a.id));
  let ok = true;
  for (const [i, id] of ids.filter((x) => line.has(x)).entries()) {
    ok = (await updateRow(type, eventId, id, { waitlist_rank: i + 1 }, "waitlisted")) && ok;
  }
  return ok;
}

/** The organizer's optional limit on the line's length (null = no limit). */
export async function setWaitlistCap(type: EventType, eventId: string, cap: number | null): Promise<boolean> {
  const value = cap == null ? null : Math.max(1, Math.min(1000, Math.round(cap)));
  const { error } = await createServiceClient().from(type === "tournament" ? "tournaments" : "board_game_nights").update({ waitlist_cap: value }).eq("id", eventId);
  return !error;
}

/** Offer a spot to anyone in line, even past the cap (the organizer's call). */
export async function offerTo(type: EventType, eventId: string, attendeeId: string): Promise<WaitlistResult> {
  const meta = await getEventMeta(type, eventId);
  const a = await findAttendee(type, eventId, attendeeId);
  if (!meta || !a) return { ok: false, error: "not_found" };
  if (a.status !== "waitlisted") return { ok: false, error: "not_waitlisted" };
  const expiresAt = offerExpiry(meta.startsAt) ?? new Date(Date.now() + 15 * 60 * 1000);
  return (await offer(type, meta, a, expiresAt, await isPaidEvent(type, eventId))) ? { ok: true, attendee: a } : { ok: false, error: "failed" };
}

/** Seat someone straight in (free events; paid events still go through tickets). */
export async function seatNow(type: EventType, eventId: string, attendeeId: string): Promise<WaitlistResult> {
  const meta = await getEventMeta(type, eventId);
  const a = await findAttendee(type, eventId, attendeeId);
  if (!meta || !a) return { ok: false, error: "not_found" };
  if (a.status !== "waitlisted" && a.status !== "offered") return { ok: false, error: "not_waitlisted" };
  return (await seat(type, meta, a, a.status)) ? { ok: true, attendee: a } : { ok: false, error: "failed" };
}

/** Take an offer back: they keep their place in line; the seat waits for the organizer's next move. */
export async function withdrawOffer(type: EventType, eventId: string, attendeeId: string): Promise<WaitlistResult> {
  const a = await findAttendee(type, eventId, attendeeId);
  if (!a) return { ok: false, error: "not_found" };
  if (a.status !== "offered") return { ok: false, error: "no_offer" };
  return (await updateRow(type, eventId, a.id, { status: "waitlisted", offer_expires_at: null }, "offered")) ? { ok: true, attendee: a } : { ok: false, error: "failed" };
}

// ─── what a person sees ──────────────────────────────────────────────────────

export interface MyWaitlist {
  status: Attendee["status"] | null;
  attendeeId: string | null;
  /** 1-based place in line, while waitlisted. */
  position: number | null;
  lineLength: number;
  capacity: number | null;
  seatsTaken: number;
  offerExpiresAt: string | null;
  /** The last stretch: open spots go to whoever claims first. */
  standby: boolean;
  /** A spot is open right now in standby. */
  spotOpen: boolean;
  paid: boolean;
  waitlistFull: boolean;
}

export async function myWaitlist(type: EventType, eventId: string, attendeeId: string | null): Promise<MyWaitlist | null> {
  const meta = await getEventMeta(type, eventId);
  if (!meta) return null;
  const attendees = await listAttendees(type, eventId);
  const line = lineOrder(attendees.map(asLine));
  const me = attendeeId ? attendees.find((a) => a.id === attendeeId) ?? null : null;
  const pos = me ? line.findIndex((a) => a.id === me.id) : -1;
  const inUse = await seatsInUse(type, eventId, attendees);
  const standby = offerPlan(meta.startsAt).kind === "standby";
  return {
    status: me?.status ?? null,
    attendeeId: me?.id ?? null,
    position: pos >= 0 ? pos + 1 : null,
    lineLength: line.length,
    capacity: meta.capacity,
    seatsTaken: inUse,
    offerExpiresAt: me?.status === "offered" ? me.offerExpiresAt ?? null : null,
    standby,
    spotOpen: standby && meta.capacity != null && inUse < meta.capacity,
    paid: await isPaidEvent(type, eventId),
    waitlistFull: meta.waitlistCap != null && line.length >= meta.waitlistCap,
  };
}
